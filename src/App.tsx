import React, { useMemo, useEffect, useState } from 'react';
import { Canvas, useResource, useFrame, useThree } from 'react-three-fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

import IrradianceSurfaceManager, {
  IrradianceSurface
} from './IrradianceSurfaceManager';
import { useIrradianceRenderer } from './IrradianceRenderer';
import SceneControls from './SceneControls';
import GridGeometry from './GridGeometry';
import {
  IrradianceDebugMaterial,
  IrradianceTextureContext
} from './IrradianceMaterials';

import sceneUrl from './tile-game-room1.glb';
import sceneTextureUrl from './tile-game-room1.png';
import sceneLumTextureUrl from './tile-game-room1-lum.png';

const Scene: React.FC<{
  loadedMesh: THREE.Mesh;
  loadedTexture: THREE.Texture;
  loadedLumTexture: THREE.Texture;
}> = ({ loadedMesh, loadedTexture, loadedLumTexture }) => {
  const {
    outputTexture,
    lightSceneElement,
    handleDebugClick,
    probeDebugTextures
  } = useIrradianceRenderer();

  const [mainSceneRef, mainScene] = useResource<THREE.Scene>();
  const [debugSceneRef, debugScene] = useResource<THREE.Scene>();

  const { size } = useThree();
  const debugCamera = useMemo(() => {
    // top-left corner is (0, 100), top-right is (100, 100)
    const aspect = size.height / size.width;
    return new THREE.OrthographicCamera(0, 100, 100, 100 * (1 - aspect), -1, 1);
  }, [size]);

  useFrame(({ gl, camera }) => {
    gl.render(mainScene, camera);
  }, 20);

  useFrame(({ gl }) => {
    gl.autoClear = false;
    gl.clearDepth();
    gl.render(debugScene, debugCamera);
    gl.autoClear = true;
  }, 30);

  return (
    <>
      <scene ref={debugSceneRef}>
        {/* render textures using probe-scene materials to avoid being affected by tone mapping */}
        {probeDebugTextures.map((tex, texIndex) => (
          <mesh position={[5, 95 - texIndex * 9, 0]} key={texIndex}>
            <planeBufferGeometry attach="geometry" args={[8, 8]} />
            <IrradianceDebugMaterial attach="material" irradianceMap={tex} />
          </mesh>
        ))}
        <mesh position={[85, 85, 0]}>
          <planeBufferGeometry attach="geometry" args={[20, 20]} />
          <IrradianceDebugMaterial
            attach="material"
            irradianceMap={outputTexture}
          />
        </mesh>
      </scene>

      <IrradianceTextureContext.Provider value={outputTexture}>
        <scene ref={mainSceneRef}>
          <mesh position={[0, 0, -5]}>
            <planeBufferGeometry attach="geometry" args={[200, 200]} />
            <meshBasicMaterial attach="material" color="#171717" />
          </mesh>

          <IrradianceSurface
            albedoMap={loadedTexture}
            emissiveMap={loadedLumTexture}
            emissiveIntensity={10}
          >
            <primitive object={loadedMesh} dispose={null} />
          </IrradianceSurface>

          <IrradianceSurface emissiveIntensity={18}>
            <mesh position={[0, 2, 6]}>
              <boxBufferGeometry attach="geometry" args={[10, 2, 0.5]} />
            </mesh>
          </IrradianceSurface>
        </scene>
      </IrradianceTextureContext.Provider>

      {lightSceneElement}
    </>
  );
};

function App() {
  const [loadedTexture, setLoadedTexture] = useState<THREE.Texture | null>(
    null
  );
  const [
    loadedLumTexture,
    setLoadedLumTexture
  ] = useState<THREE.Texture | null>(null);
  const [loadedMesh, setLoadedMesh] = useState<THREE.Mesh | null>(null);

  useEffect(() => {
    new THREE.TextureLoader().load(sceneTextureUrl, (data) => {
      data.magFilter = THREE.NearestFilter;
      data.flipY = false;
      setLoadedTexture(data);
    });

    new THREE.TextureLoader().load(sceneLumTextureUrl, (data) => {
      data.magFilter = THREE.NearestFilter;
      data.flipY = false;
      setLoadedLumTexture(data);
    });

    new GLTFLoader().load(sceneUrl, (data) => {
      data.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) {
          return;
        }

        if (object.name === 'Base') {
          setLoadedMesh(object);
        }
      });
    });
  }, []);

  return (
    <Canvas
      camera={{ position: [-4, -4, 8], up: [0, 0, 1] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.9;

        gl.outputEncoding = THREE.sRGBEncoding;
      }}
    >
      {loadedMesh && loadedTexture && loadedLumTexture ? (
        <IrradianceSurfaceManager>
          <Scene
            loadedMesh={loadedMesh}
            loadedTexture={loadedTexture}
            loadedLumTexture={loadedLumTexture}
          />
        </IrradianceSurfaceManager>
      ) : null}

      <SceneControls />
    </Canvas>
  );
}

export default App;
