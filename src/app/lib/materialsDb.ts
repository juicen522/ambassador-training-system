import type { Material, MaterialFile, MaterialInput } from '../types/material';
import {
  inferMaterialType,
  resolveMaterialType,
  titleFromFileName,
} from '../types/material';

const DB_NAME = 'ambassador-training-materials';
const DB_VERSION = 2;
const MATERIALS_STORE = 'materials';
const FILES_STORE = 'files';

interface StoredFileBlob {
  id: string;
  materialId: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;

      if (!db.objectStoreNames.contains(MATERIALS_STORE)) {
        db.createObjectStore(MATERIALS_STORE, { keyPath: 'id' });
      }

      if (event.oldVersion < 2 && db.objectStoreNames.contains(FILES_STORE)) {
        db.deleteObjectStore(FILES_STORE);
      }

      if (!db.objectStoreNames.contains(FILES_STORE)) {
        const filesStore = db.createObjectStore(FILES_STORE, { keyPath: 'id' });
        filesStore.createIndex('byMaterialId', 'materialId', { unique: false });
      }
    };
  });
}

function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        const request = fn(store);

        transaction.oncomplete = () => {
          if (request && 'result' in request) {
            resolve((request as IDBRequest<T>).result);
          } else {
            resolve(undefined as T);
          }
        };
        transaction.onerror = () => reject(transaction.error);
        if (request) {
          request.onerror = () => reject(request.error);
        }
      }),
  );
}

const defaultMaterials: Omit<Material, 'createdAt' | 'updatedAt' | 'files'>[] = [
  {
    id: 'seed-1',
    title: '园林植物识别指南',
    category: '植物识别',
    type: 'PDF',
    description: '详细介绍园内常见植物的特征、习性和讲解要点',
    views: 234,
  },
  {
    id: 'seed-2',
    title: '中国园林艺术发展史',
    category: '园林历史',
    type: 'PDF',
    description: '从古典园林到现代园林的发展脉络',
    views: 156,
  },
  {
    id: 'seed-3',
    title: '讲解员服务规范培训',
    category: '服务规范',
    type: '视频',
    description: '标准服务流程、礼仪规范及应急处理',
    views: 189,
  },
  {
    id: 'seed-4',
    title: '园林摄影点位图',
    category: '讲解技巧',
    type: '图片',
    description: '最佳拍摄角度和推荐讲解点位',
    views: 278,
  },
  {
    id: 'seed-5',
    title: '四季植物观赏指南',
    category: '植物识别',
    type: 'PDF',
    description: '不同季节的重点观赏植物和讲解重点',
    views: 312,
  },
  {
    id: 'seed-6',
    title: '游客安全管理要点',
    category: '安全知识',
    type: 'PDF',
    description: '常见安全隐患识别和应急处理流程',
    views: 201,
  },
];

function nowIso() {
  return new Date().toISOString();
}

type LegacyMaterial = Material & {
  files?: MaterialFile[];
  hasFile?: boolean;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
};

function normalizeMaterial(raw: LegacyMaterial): Material {
  const files = raw.files ?? [];
  if (files.length === 0 && raw.hasFile && raw.fileName) {
    files.push({
      id: `legacy-${raw.id}`,
      fileName: raw.fileName,
      fileSize: raw.fileSize ?? 0,
      mimeType: raw.mimeType ?? '',
      type: raw.type,
    });
  }

  const { hasFile: _h, fileName: _n, fileSize: _s, mimeType: _m, ...rest } = raw;
  return { ...rest, files };
}

export async function migrateMaterialsSchema(): Promise<void> {
  const items = await tx<LegacyMaterial[]>(MATERIALS_STORE, 'readonly', (store) =>
    store.getAll(),
  );

  for (const raw of items) {
    if (raw.files && !raw.hasFile) continue;
    const normalized = normalizeMaterial(raw);
    if (
      normalized.files.length !== (raw.files?.length ?? 0) ||
      raw.hasFile !== undefined
    ) {
      await saveMaterialRecord(normalized);
    }
  }
}

export async function seedMaterialsIfEmpty(): Promise<void> {
  await migrateMaterialsSchema();

  const existing = await listMaterials();
  if (existing.length > 0) return;

  const timestamp = nowIso();
  await openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(MATERIALS_STORE, 'readwrite');
        const store = transaction.objectStore(MATERIALS_STORE);

        for (const item of defaultMaterials) {
          store.put({
            ...item,
            files: [],
            createdAt: timestamp,
            updatedAt: timestamp,
          } satisfies Material);
        }

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      }),
  );
}

export async function listMaterials(): Promise<Material[]> {
  const items = await tx<Material[]>(MATERIALS_STORE, 'readonly', (store) => store.getAll());
  return items.map(normalizeMaterial).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export async function getMaterial(id: string): Promise<Material | undefined> {
  const item = await tx<Material | undefined>(MATERIALS_STORE, 'readonly', (store) =>
    store.get(id),
  );
  return item ? normalizeMaterial(item) : undefined;
}

async function persistFiles(materialId: string, uploads: File[]): Promise<MaterialFile[]> {
  const metas: MaterialFile[] = [];

  for (const file of uploads) {
    const fileId = crypto.randomUUID();
    const meta: MaterialFile = {
      id: fileId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      type: inferMaterialType(file),
    };

    await tx(FILES_STORE, 'readwrite', (store) =>
      store.put({
        id: fileId,
        materialId,
        blob: file,
        fileName: file.name,
        mimeType: meta.mimeType,
        fileSize: file.size,
      } satisfies StoredFileBlob),
    );

    metas.push(meta);
  }

  return metas;
}

export async function createMaterial(
  input: MaterialInput,
  files: File[] = [],
): Promise<Material> {
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  const uploaded = await persistFiles(id, files);

  const material: Material = {
    id,
    ...input,
    views: 0,
    files: uploaded,
    type: resolveMaterialType(uploaded, input.type),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await saveMaterialRecord(material);
  return material;
}

/** 每个文件单独生成一条资料，标题自动取自文件名 */
export async function createMaterialsFromFiles(
  files: File[],
  defaults: Partial<MaterialInput> = {},
): Promise<Material[]> {
  const results: Material[] = [];
  for (const file of files) {
    const input: MaterialInput = {
      title: titleFromFileName(file.name),
      category: defaults.category ?? '植物识别',
      type: inferMaterialType(file),
      description: defaults.description ?? '',
    };
    results.push(await createMaterial(input, [file]));
  }
  return results;
}

export async function updateMaterial(id: string, input: MaterialInput): Promise<Material> {
  const existing = await getMaterial(id);
  if (!existing) {
    throw new Error('资料不存在');
  }

  const material: Material = {
    ...existing,
    ...input,
    type: resolveMaterialType(existing.files, input.type),
    updatedAt: nowIso(),
  };

  await saveMaterialRecord(material);
  return material;
}

export async function addFilesToMaterial(id: string, files: File[]): Promise<Material> {
  const existing = await getMaterial(id);
  if (!existing) {
    throw new Error('资料不存在');
  }

  const uploaded = await persistFiles(id, files);
  const material: Material = {
    ...existing,
    files: [...existing.files, ...uploaded],
    type: resolveMaterialType([...existing.files, ...uploaded], existing.type),
    updatedAt: nowIso(),
  };

  await saveMaterialRecord(material);
  return material;
}

export async function removeMaterialFile(materialId: string, fileId: string): Promise<Material> {
  const existing = await getMaterial(materialId);
  if (!existing) {
    throw new Error('资料不存在');
  }

  await tx(FILES_STORE, 'readwrite', (store) => store.delete(fileId));

  const files = existing.files.filter((f) => f.id !== fileId);
  const material: Material = {
    ...existing,
    files,
    type: resolveMaterialType(files, existing.type),
    updatedAt: nowIso(),
  };

  await saveMaterialRecord(material);
  return material;
}

export async function deleteMaterial(id: string): Promise<void> {
  const existing = await getMaterial(id);
  if (!existing) return;

  await openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([MATERIALS_STORE, FILES_STORE], 'readwrite');
        transaction.objectStore(MATERIALS_STORE).delete(id);

        for (const file of existing.files) {
          if (!file.id.startsWith('legacy-')) {
            transaction.objectStore(FILES_STORE).delete(file.id);
          }
        }

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      }),
  );
}

export async function incrementMaterialViews(id: string): Promise<Material | undefined> {
  const existing = await getMaterial(id);
  if (!existing) return undefined;

  const material: Material = {
    ...existing,
    views: existing.views + 1,
    updatedAt: nowIso(),
  };
  await saveMaterialRecord(material);
  return material;
}

export async function getMaterialFileById(fileId: string): Promise<StoredFileBlob | undefined> {
  if (fileId.startsWith('legacy-')) return undefined;
  return tx<StoredFileBlob | undefined>(FILES_STORE, 'readonly', (store) => store.get(fileId));
}

async function saveMaterialRecord(material: Material): Promise<void> {
  await tx(MATERIALS_STORE, 'readwrite', (store) => store.put(material));
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
