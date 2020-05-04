import React, { useRef, useState, useLayoutEffect, useMemo } from 'react';
import {
  Canvas,
  useUpdate,
  useResource,
  useFrame,
  useThree,
  extend,
  ReactThreeFiber
} from 'react-three-fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

extend({ OrbitControls });

declare global {
  namespace JSX {
    interface IntrinsicElements {
      orbitControls: ReactThreeFiber.Object3DNode<
        OrbitControls,
        typeof OrbitControls
      >;
    }
  }
}

const faceTexW = 0.2;
const faceTexH = 0.2;
const texMargin = 0.05;

const facesPerRow = Math.floor(1 / (faceTexW + texMargin));

function computeFaceUV(faceIndex: number) {
  const faceColumn = faceIndex % facesPerRow;
  const faceRow = Math.floor(faceIndex / facesPerRow);

  const left = faceColumn * (faceTexW + texMargin);
  const top = faceRow * (faceTexH + texMargin);
  const right = left + faceTexW;
  const bottom = top + faceTexH;

  return { left, top, right, bottom };
}

let testCount = 0;

function Scene() {
  const [lightSceneRef, lightScene] = useResource<THREE.Scene>();
  const [mainSceneRef, mainScene] = useResource<THREE.Scene>();

  const atlasWidth = 64;
  const atlasHeight = 64;
  const size = atlasWidth * atlasHeight;

  const atlasData = useMemo(() => {
    const data = new Uint8Array(3 * size);

    for (let i = 0; i < size; i++) {
      const x = i % atlasWidth;
      const y = Math.floor(i / atlasWidth);

      const stride = i * 3;

      const v = x % 8 === 0 || y % 8 === 0 ? 0 : 255;
      data[stride] = v;
      data[stride + 1] = v;
      data[stride + 2] = v;
    }

    return data;
  }, [size]);

  const atlasTexture = useMemo(() => {
    return new THREE.DataTexture(
      atlasData,
      atlasWidth,
      atlasHeight,
      THREE.RGBFormat
    );
  }, []);

  const [mesh1Ref, mesh1] = useResource<THREE.Mesh>();
  const [mesh2Ref, mesh2] = useResource<THREE.Mesh>();

  const atlasInfo: {
    mesh: THREE.Mesh;
    buffer: THREE.BufferGeometry;
    faceIndex: number;
    left: number;
    top: number;
    right: number;
    bottom: number;
  }[] = useMemo(() => [], []);

  const [meshBuffer1Ref, meshBuffer1] = useResource<THREE.BufferGeometry>();

  useLayoutEffect(() => {
    if (!mesh1 || !meshBuffer1) {
      return;
    }

    const uvAttr = meshBuffer1.attributes.uv;

    for (let faceIndex = 0; faceIndex < 6; faceIndex += 1) {
      const { left, top, right, bottom } = computeFaceUV(faceIndex);

      // default is [0, 1, 1, 1, 0, 0, 1, 0]
      const uvItemBase = faceIndex * 4;
      uvAttr.setXY(uvItemBase, left, bottom);
      uvAttr.setXY(uvItemBase + 1, right, bottom);
      uvAttr.setXY(uvItemBase + 2, left, top);
      uvAttr.setXY(uvItemBase + 3, right, top);

      atlasInfo.push({
        mesh: mesh1,
        buffer: meshBuffer1,
        faceIndex,
        left,
        top,
        right,
        bottom
      });
    }

    meshBuffer1.setAttribute('uv2', new THREE.BufferAttribute(uvAttr.array, 2));
  }, [mesh1, meshBuffer1]);

  const [meshBuffer2Ref, meshBuffer2] = useResource<THREE.BufferGeometry>();
  useLayoutEffect(() => {
    if (!mesh2 || !meshBuffer2) {
      return;
    }

    const uvAttr = meshBuffer2.attributes.uv;

    for (let faceIndex = 0; faceIndex < 6; faceIndex += 1) {
      const { left, top, right, bottom } = computeFaceUV(faceIndex);

      // default is [0, 1, 1, 1, 0, 0, 1, 0]
      const uvItemBase = faceIndex * 4;
      uvAttr.setXY(uvItemBase, left, bottom);
      uvAttr.setXY(uvItemBase + 1, right, bottom);
      uvAttr.setXY(uvItemBase + 2, left, top);
      uvAttr.setXY(uvItemBase + 3, right, top);

      atlasInfo.push({
        mesh: mesh2,
        buffer: meshBuffer2,
        faceIndex,
        left,
        top,
        right,
        bottom
      });
    }

    meshBuffer2.setAttribute('uv2', new THREE.BufferAttribute(uvAttr.array, 2));
  }, [mesh2, meshBuffer2]);

  const rtWidth = 32;
  const rtHeight = 32;
  const testTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(rtWidth, rtHeight);
  }, []);

  const testCam = useMemo(() => {
    const rtFov = 90; // full near-180 FOV actually works poorly
    const rtAspect = rtWidth / rtHeight;
    const rtNear = 0.05;
    const rtFar = 10;
    return new THREE.PerspectiveCamera(rtFov, rtAspect, rtNear, rtFar);
  }, []);

  const testBuffer = useMemo(() => {
    return new Uint8Array(rtWidth * rtHeight * 4);
  }, []);

  const pinholeTexture = useMemo(() => {
    return new THREE.DataTexture(
      testBuffer,
      rtWidth,
      rtHeight,
      THREE.RGBAFormat
    );
  }, []);

  useFrame(({ gl, scene }) => {
    // wait until atlas is initialized
    if (atlasInfo.length === 0) {
      return;
    }

    // face 4 is the top one
    const atlasFaceInfo = atlasInfo[4];

    const { mesh, buffer, faceIndex, left, top, right, bottom } = atlasFaceInfo;
    const faceTexW = (right - left) * atlasWidth;
    const faceTexH = (bottom - top) * atlasHeight;
    const faceTexelCols = Math.ceil(faceTexW);
    const faceTexelRows = Math.ceil(faceTexH);

    // even texel offset from face origin inside texture data
    const faceTexelX = testCount % faceTexelCols;
    const faceTexelY = Math.floor(testCount / faceTexelCols);
    testCount = (testCount + 1) % (faceTexelRows * faceTexelCols);

    // find texel inside atlas, as rounded to texel boundary
    const atlasTexelLeft = left * atlasWidth;
    const atlasTexelTop = top * atlasWidth;
    const atlasTexelX = Math.floor(atlasTexelLeft) + faceTexelX;
    const atlasTexelY = Math.floor(atlasTexelTop) + faceTexelY;

    // compute rounded texel's U and V position within face
    // (biasing to be in middle of texel physical square)
    const pU = (atlasTexelX + 0.5 - atlasTexelLeft) / faceTexW;
    const pV = (atlasTexelY + 0.5 - atlasTexelTop) / faceTexH;

    // read vertex position for this face and interpolate along U and V axes
    const posArray = buffer.attributes.position.array;
    const normalArray = buffer.attributes.normal.array;
    const facePosStart = faceIndex * 4 * 3;
    const facePosOrigin = facePosStart + 2 * 3;
    const facePosU = facePosStart + 3 * 3;
    const facePosV = facePosStart;

    const faceNormalStart = faceIndex * 4 * 3;

    const ox = posArray[facePosOrigin];
    const oy = posArray[facePosOrigin + 1];
    const oz = posArray[facePosOrigin + 2];

    const dUx = posArray[facePosU] - ox;
    const dUy = posArray[facePosU + 1] - oy;
    const dUz = posArray[facePosU + 2] - oz;

    const dVx = posArray[facePosV] - ox;
    const dVy = posArray[facePosV + 1] - oy;
    const dVz = posArray[facePosV + 2] - oz;

    // console.log(atlasTexelX, atlasTexelY, pUVx, pUVy, pUVz);

    // set camera to match texel, first in mesh-local space
    const texelPos = new THREE.Vector3(
      ox + dUx * pU + dVx * pV,
      oy + dUy * pU + dVy * pV,
      oz + dUz * pU + dVz * pV
    );

    testCam.position.copy(texelPos);

    texelPos.x += normalArray[faceNormalStart];
    texelPos.y += normalArray[faceNormalStart + 1];
    texelPos.z += normalArray[faceNormalStart + 2];

    const upAngle = Math.random() * Math.PI;
    const upAngleCos = Math.cos(upAngle);
    const upAngleSin = Math.sin(upAngle);

    testCam.up.set(
      dUx * upAngleCos - dVx * upAngleSin,
      dUy * upAngleCos - dVy * upAngleSin,
      dUz * upAngleCos - dVz * upAngleSin
    ); // random rotation (in face plane) @todo normalize axes?

    testCam.lookAt(texelPos);

    // then, transform camera into world space
    testCam.applyMatrix4(mesh.matrixWorld);

    gl.setRenderTarget(testTarget);
    gl.render(lightScene, testCam);
    gl.setRenderTarget(null);

    gl.readRenderTargetPixels(testTarget, 0, 0, rtWidth, rtHeight, testBuffer);
    pinholeTexture.needsUpdate = true;

    const rtLength = testBuffer.length;
    let r = 0,
      g = 0,
      b = 0;
    for (let i = 0; i < rtLength; i += 4) {
      r += testBuffer[i];
      g += testBuffer[i + 1];
      b += testBuffer[i + 2];
    }

    const pixelCount = rtWidth * rtHeight;
    const ar = Math.round(r / pixelCount);
    const ag = Math.round(g / pixelCount);
    const ab = Math.round(b / pixelCount);

    atlasData.set([ar, ag, ab], (atlasTexelY * atlasWidth + atlasTexelX) * 3);
    atlasTexture.needsUpdate = true;
  }, 10);

  useFrame(({ gl, camera }) => {
    gl.render(mainScene, camera);
  }, 20);

  const mesh1Pos: [number, number, number] = [0, 0, -2];
  const mesh1Args: [number, number, number] = [5, 5, 2];
  const mesh2Pos: [number, number, number] = [0, 0, 3];
  const mesh2Args: [number, number, number] = [1, 1, 6];
  const lightPos: [number, number, number] = [5, -5, 10];

  return (
    <>
      <scene ref={mainSceneRef}>
        <mesh position={[0, 0, -5]}>
          <planeBufferGeometry attach="geometry" args={[200, 200]} />
          <meshBasicMaterial attach="material" color="#171717" />
        </mesh>
        <mesh position={[-4, 4, 0]}>
          <planeBufferGeometry attach="geometry" args={[2, 2]} />
          <meshBasicMaterial attach="material" map={pinholeTexture} />
        </mesh>

        <mesh position={mesh1Pos}>
          <boxBufferGeometry
            attach="geometry"
            args={mesh1Args}
            ref={meshBuffer1Ref}
          />
          <meshBasicMaterial attach="material" map={atlasTexture} />
        </mesh>
        <mesh position={mesh2Pos}>
          <boxBufferGeometry
            attach="geometry"
            args={mesh2Args}
            ref={meshBuffer2Ref}
          />
          <meshBasicMaterial attach="material" map={atlasTexture} />
        </mesh>
      </scene>

      <scene ref={lightSceneRef}>
        <mesh position={mesh1Pos} ref={mesh1Ref}>
          {meshBuffer1 && (
            <primitive attach="geometry" object={meshBuffer1} dispose={null} />
          )}
          <meshBasicMaterial attach="material" color="red" />
        </mesh>

        <mesh position={mesh2Pos} ref={mesh2Ref}>
          {meshBuffer2 && (
            <primitive attach="geometry" object={meshBuffer2} dispose={null} />
          )}
          <meshBasicMaterial attach="material" color="red" />
        </mesh>

        <mesh position={lightPos}>
          <boxBufferGeometry attach="geometry" args={[8, 8, 8]} />
          <meshBasicMaterial attach="material" color="white" />
        </mesh>
      </scene>
    </>
  );
}

const Controls: React.FC = () => {
  const { camera, gl } = useThree();
  const orbitControlsRef = useRef<OrbitControls>();

  useFrame(() => {
    if (!orbitControlsRef.current) {
      return;
    }
    orbitControlsRef.current.update();
  });

  return (
    <orbitControls
      ref={orbitControlsRef}
      args={[camera, gl.domElement]}
      enableDamping
      dampingFactor={0.1}
      rotateSpeed={0.5}
    />
  );
};

function App() {
  return (
    <Canvas
      camera={{ position: [-4, -4, 8], up: [0, 0, 1] }}
      onCreated={({ gl }) => {
        // gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.outputEncoding = THREE.sRGBEncoding;
      }}
    >
      <Scene />

      <Controls />
    </Canvas>
  );
}

export default App;
