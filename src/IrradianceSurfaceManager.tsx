import React, { useMemo, useCallback, useContext } from 'react';
import { useUpdate } from 'react-three-fiber';
import * as THREE from 'three';

export const atlasWidth = 128;
export const atlasHeight = 128;

const bleedOffsetU = 1 / atlasWidth;
const bleedOffsetV = 1 / atlasHeight;

const itemCellU = 1 / 8;
const itemCellV = 1 / 8;
const itemTexelU = Math.floor(atlasWidth * itemCellU) - 2;
const itemTexelV = Math.floor(atlasHeight * itemCellV) - 2;
const itemSizeU = itemTexelU / atlasWidth;
const itemSizeV = itemTexelV / atlasHeight;

// maximum physical dimension of a stored item's face
const atlasItemMaxDim = 5;

const itemsPerRow = Math.floor(1 / itemCellU);

const tmpFaceIndexes: [number, number, number, number] = [-1, -1, -1, -1];
const tmpOrigin = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpV = new THREE.Vector3();

export interface AtlasQuad {
  mesh: THREE.Mesh;
  buffer: THREE.BufferGeometry;
  quadIndex: number;
  left: number;
  top: number;
  sizeU: number;
  sizeV: number;
}

export interface AtlasSceneItem {
  mesh: THREE.Mesh;
  buffer: THREE.Geometry | THREE.BufferGeometry; // either is fine
  albedoMap?: THREE.Texture;
  emissive: THREE.Color;
  emissiveIntensity: number;
  emissiveMap?: THREE.Texture;
}

export interface AtlasLightFactor {
  mesh: THREE.Mesh;
  emissiveIntensity: number;
}

export interface Atlas {
  quads: AtlasQuad[];
  lightSceneItems: AtlasSceneItem[];
  lightFactors: { [name: string]: AtlasLightFactor };
  factorValues: { [name: string]: number };
}

const IrradianceAtlasContext = React.createContext<Atlas | null>(null);

export function useIrradianceAtlasContext() {
  const atlasInfo = useContext(IrradianceAtlasContext);

  if (!atlasInfo) {
    throw new Error('must be inside manager context');
  }

  return atlasInfo;
}

function fetchFaceIndexes(indexArray: ArrayLike<number>, quadIndex: number) {
  const vBase = quadIndex * 6;

  // pattern is ABD, BCD
  tmpFaceIndexes[0] = indexArray[vBase];
  tmpFaceIndexes[1] = indexArray[vBase + 1];
  tmpFaceIndexes[2] = indexArray[vBase + 4];
  tmpFaceIndexes[3] = indexArray[vBase + 5];
}

function fetchFaceAxes(
  posArray: ArrayLike<number>,
  quadIndexes: [number, number, number, number]
) {
  // get face vertex positions
  const facePosOrigin = quadIndexes[1] * 3;
  const facePosU = quadIndexes[2] * 3;
  const facePosV = quadIndexes[0] * 3;

  tmpOrigin.fromArray(posArray, facePosOrigin);
  tmpU.fromArray(posArray, facePosU);
  tmpV.fromArray(posArray, facePosV);
}

function computeFaceUV(
  atlasFaceIndex: number,
  posArray: ArrayLike<number>,
  quadIndexes: ArrayLike<number>
) {
  const itemColumn = atlasFaceIndex % itemsPerRow;
  const itemRow = Math.floor(atlasFaceIndex / itemsPerRow);

  // get face vertex positions
  fetchFaceAxes(posArray, tmpFaceIndexes);

  // compute face dimensions
  tmpU.sub(tmpOrigin);
  tmpV.sub(tmpOrigin);

  const dUdim = Math.min(atlasItemMaxDim, tmpU.length());
  const dVdim = Math.min(atlasItemMaxDim, tmpV.length());

  const texelU = Math.max(
    1,
    Math.floor(atlasWidth * itemSizeU * (dUdim / atlasItemMaxDim))
  );
  const texelV = Math.max(
    1,
    Math.floor(atlasHeight * itemSizeV * (dVdim / atlasItemMaxDim))
  );

  const left = itemColumn * itemCellU + bleedOffsetU;
  const top = itemRow * itemCellV + bleedOffsetV;
  const sizeU = texelU / atlasWidth;
  const sizeV = texelV / atlasHeight;

  return { left, top, sizeU, sizeV };
}

// @todo wrap in provider helper
export const IrradianceTextureContext = React.createContext<THREE.Texture | null>(
  null
);

// attach a mesh to be mapped in texture atlas
export function useAtlasMeshRef(withMesh?: (mesh: THREE.Mesh) => void) {
  const atlas = useIrradianceAtlasContext();
  const { quads, lightSceneItems } = atlas;

  const meshRef = useUpdate<THREE.Mesh>((mesh) => {
    const meshBuffer = mesh.geometry;
    const material = mesh.material;

    if (Array.isArray(material)) {
      throw new Error('material array not supported');
    }

    if (!(material instanceof THREE.MeshLambertMaterial)) {
      throw new Error('only Lambert materials are supported');
    }

    // register display item
    lightSceneItems.push({
      mesh,
      buffer: meshBuffer,
      albedoMap: material.map || undefined,
      emissive: material.emissive,
      emissiveIntensity: material.emissiveIntensity, // @todo if factor contributor, zero emissive by default
      emissiveMap: material.emissiveMap || undefined
    });

    // @todo support dynamic light factors

    if (!(meshBuffer instanceof THREE.BufferGeometry)) {
      throw new Error('expected buffer geometry');
    }

    if (!meshBuffer.index) {
      throw new Error('expecting indexed mesh buffer');
    }

    if (material.map) {
      const indexes = meshBuffer.index.array;
      const posAttr = meshBuffer.attributes.position;

      const quadCount = Math.floor(indexes.length / 6); // assuming quads, 2x tris each

      const atlasUVAttr = new THREE.Float32BufferAttribute(
        quadCount * 4 * 2,
        2
      );

      for (let quadIndex = 0; quadIndex < quadCount; quadIndex += 1) {
        const atlasFaceIndex = quads.length;

        fetchFaceIndexes(indexes, quadIndex);

        const { left, top, sizeU, sizeV } = computeFaceUV(
          atlasFaceIndex,
          posAttr.array,
          tmpFaceIndexes
        );

        atlasUVAttr.setXY(tmpFaceIndexes[0], left, top + sizeV);
        atlasUVAttr.setXY(tmpFaceIndexes[1], left, top);
        atlasUVAttr.setXY(tmpFaceIndexes[2], left + sizeU, top);
        atlasUVAttr.setXY(tmpFaceIndexes[3], left + sizeU, top + sizeV);

        quads.push({
          mesh: mesh,
          buffer: meshBuffer,
          quadIndex,
          left,
          top,
          sizeU,
          sizeV
        });
      }

      // store illumination UV as dedicated attribute
      meshBuffer.setAttribute(
        'uv2',
        atlasUVAttr.setUsage(THREE.StaticDrawUsage)
      );
    }

    // allow upstream code to run
    if (withMesh) {
      withMesh(mesh);
    }
  }, []);

  return meshRef;
}

export function useIrradianceFactors() {
  const atlas = useIrradianceAtlasContext();

  const setFactorValues = useCallback(
    (factorValues: { [name: string]: number }) => {
      atlas.factorValues = { ...factorValues };
    },
    [atlas]
  );

  return setFactorValues;
}

const IrradianceSurfaceManager: React.FC = ({ children }) => {
  const atlas: Atlas = useMemo(
    () => ({
      quads: [],
      lightSceneItems: [],
      lightFactors: {},
      factorValues: {}
    }),
    []
  );

  return (
    <IrradianceAtlasContext.Provider value={atlas}>
      {children}
    </IrradianceAtlasContext.Provider>
  );
};

export default IrradianceSurfaceManager;
