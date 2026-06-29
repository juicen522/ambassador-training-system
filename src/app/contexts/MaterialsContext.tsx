import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  createMaterialApi,
  deleteMaterialApi,
  deleteMaterialFileApi,
  listMaterialsApi,
  recordMaterialViewApi,
  reorderMaterialsApi,
  toggleMaterialHiddenApi,
  updateMaterialApi,
  uploadMaterialFilesApi,
} from '../lib/materialsApi';
import type { Material, MaterialInput } from '../types/material';
import { titleFromFileName, inferMaterialType } from '../types/material';

interface EditMaterialOptions {
  addFiles?: File[];
  removeFileIds?: string[];
}

interface MaterialsContextType {
  materials: Material[];
  loading: boolean;
  refresh: () => Promise<void>;
  addMaterial: (input: MaterialInput, files?: File[]) => Promise<Material>;
  addMaterialsFromFiles: (
    files: File[],
    defaults?: Partial<MaterialInput>,
  ) => Promise<Material[]>;
  editMaterial: (
    id: string,
    input: MaterialInput,
    options?: EditMaterialOptions,
  ) => Promise<Material>;
  removeMaterial: (id: string) => Promise<void>;
  toggleMaterialHidden: (id: string, hidden: boolean) => Promise<Material>;
  reorderMaterials: (ids: string[]) => Promise<void>;
  recordView: (id: string) => Promise<void>;
}

const MaterialsContext = createContext<MaterialsContextType | undefined>(undefined);

export function MaterialsProvider({ children }: { children: ReactNode }) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const list = await listMaterialsApi();
    setMaterials(list);
  }, []);

  useEffect(() => {
    refresh()
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [refresh]);

  const addMaterial = useCallback(
    async (input: MaterialInput, files: File[] = []) => {
      let material = await createMaterialApi(input);
      try {
        if (files.length > 0) {
          material = await uploadMaterialFilesApi(material.id, files);
        }
      } catch (err) {
        await deleteMaterialApi(material.id).catch(() => {});
        throw err;
      }
      try {
        await refresh();
      } catch (refreshErr) {
        console.warn('资料已保存，刷新列表失败', refreshErr);
      }
      return material;
    },
    [refresh],
  );

  const addMaterialsFromFiles = useCallback(
    async (files: File[], defaults?: Partial<MaterialInput>) => {
      const results: Material[] = [];
      for (const file of files) {
        const input: MaterialInput = {
          title: titleFromFileName(file.name),
          category: defaults?.category ?? '植物识别',
          type: inferMaterialType(file),
          description: defaults?.description ?? '',
          hidden: defaults?.hidden ?? false,
        };
        results.push(await addMaterial(input, [file]));
      }
      return results;
    },
    [addMaterial],
  );

  const editMaterial = useCallback(
    async (id: string, input: MaterialInput, options?: EditMaterialOptions) => {
      let material = await updateMaterialApi(id, input);

      if (options?.removeFileIds?.length) {
        for (const fileId of options.removeFileIds) {
          material = await deleteMaterialFileApi(id, fileId);
        }
      }

      if (options?.addFiles?.length) {
        material = await uploadMaterialFilesApi(id, options.addFiles);
      }

      try {
        await refresh();
      } catch (refreshErr) {
        console.warn('资料已更新，刷新列表失败', refreshErr);
      }
      return material;
    },
    [refresh],
  );

  const removeMaterial = useCallback(
    async (id: string) => {
      await deleteMaterialApi(id);
      await refresh();
    },
    [refresh],
  );

  const toggleMaterialHidden = useCallback(async (id: string, hidden: boolean) => {
    const updated = await toggleMaterialHiddenApi(id, hidden);
    setMaterials((prev) => prev.map((m) => (m.id === id ? updated : m)));
    return updated;
  }, []);

  const reorderMaterials = useCallback(async (ids: string[]) => {
    const list = await reorderMaterialsApi(ids);
    setMaterials(list);
  }, []);

  const recordView = useCallback(async (id: string) => {
    try {
      const updated = await recordMaterialViewApi(id);
      setMaterials((prev) =>
        prev.map((m) => (m.id === id ? { ...m, views: updated.views } : m)),
      );
    } catch {
      /* 浏览统计失败不影响阅读 */
    }
  }, []);

  const value = useMemo(
    () => ({
      materials,
      loading,
      refresh,
      addMaterial,
      addMaterialsFromFiles,
      editMaterial,
      removeMaterial,
      toggleMaterialHidden,
      reorderMaterials,
      recordView,
    }),
    [
      materials,
      loading,
      refresh,
      addMaterial,
      addMaterialsFromFiles,
      editMaterial,
      removeMaterial,
      toggleMaterialHidden,
      reorderMaterials,
      recordView,
    ],
  );

  return (
    <MaterialsContext.Provider value={value}>{children}</MaterialsContext.Provider>
  );
}

export function useMaterials() {
  const context = useContext(MaterialsContext);
  if (!context) {
    throw new Error('useMaterials must be used within MaterialsProvider');
  }
  return context;
}
