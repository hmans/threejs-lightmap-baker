import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef
} from 'react';
import { useFrame } from 'react-three-fiber';

const WORK_PER_FRAME = 5;

type WorkCallback = (gl: THREE.WebGLRenderer) => void;
type WorkManagerHook = (callback: WorkCallback | null) => void;
export const WorkManagerContext = React.createContext<WorkManagerHook | null>(
  null
);

interface RendererJobInfo {
  id: number;
  callbackRef: React.MutableRefObject<WorkCallback | null>;
}

// this runs inside the renderer hook instance
function useJobInstance(
  jobCountRef: React.MutableRefObject<number>,
  setJobs: React.Dispatch<React.SetStateAction<RendererJobInfo[]>>,
  callback: WorkCallback | null
) {
  // unique job ID
  const jobId = useMemo<number>(() => {
    // generate new job ID on mount
    jobCountRef.current += 1;
    return jobCountRef.current;
  }, []);

  // wrap latest callback in stable ref
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  // add or update job object (preserving the order)
  useEffect(() => {
    const jobInfo = {
      id: jobId,
      callbackRef
    };

    setJobs((prev) => {
      const newJobs = [...prev];

      const jobIndex = prev.findIndex((job) => job.id === jobId);
      if (jobIndex === -1) {
        newJobs.push(jobInfo);
      } else {
        newJobs[jobIndex] = jobInfo;
      }

      return newJobs;
    });
  }, [jobId]);

  // clean up on unmount
  useEffect(() => {
    return () => {
      // keep all jobs that do not have our ID
      setJobs((prev) => prev.filter((info) => info.id !== jobId));
    };
  }, [jobId]);
}

const WorkManager: React.FC = ({ children }) => {
  const jobCountRef = useRef(0);
  const [jobs, setJobs] = useState<RendererJobInfo[]>([]);

  const hook = useCallback<WorkManagerHook>((callback) => {
    useJobInstance(jobCountRef, setJobs, callback); // eslint-disable-line react-hooks/rules-of-hooks
  }, []);

  // actual per-frame work invocation
  useFrame(({ gl }) => {
    // get active job, if any
    const activeJob = jobs.find((job) => !!job.callbackRef.current);

    // check if there is nothing to do
    if (!activeJob) {
      return;
    }

    // invoke work callback
    for (let i = 0; i < WORK_PER_FRAME; i += 1) {
      // check if callback is still around (might go away mid-batch)
      const callback = activeJob.callbackRef.current;

      if (!callback) {
        return;
      }

      callback(gl);
    }
  }, 10);

  return (
    <>
      <WorkManagerContext.Provider value={hook}>
        {children}
      </WorkManagerContext.Provider>
    </>
  );
};

export default WorkManager;