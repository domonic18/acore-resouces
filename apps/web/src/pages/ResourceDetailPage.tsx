import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Box, FileImage, FolderTree, Layers } from 'lucide-react';
import { getResource, getResourceAssets, getModelPreview, getIconPreviewUrl } from '@/shared/resources';
import { TextureViewer } from '@/components/viewer/TextureViewer';
import { AssetFileTree } from '@/components/viewer/AssetFileTree';
import { ModelViewer } from '@/components/viewer/ModelViewer';
import { cn } from '@/shared/utils';

type TabKey = 'overview' | 'assets' | 'preview';

export function ResourceDetailPage() {
  const { resourceType = 'mount', id } = useParams<{ resourceType: string; id: string }>();
  const resourceId = parseInt(id || '0', 10);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const { data: resource, isLoading, error } = useQuery({
    queryKey: ['resource', resourceType, resourceId],
    queryFn: () => getResource(resourceType, resourceId),
  });

  const { data: assets } = useQuery({
    queryKey: ['assets', resourceType, resourceId],
    queryFn: () => getResourceAssets(resourceType, resourceId),
    enabled: !!resource,
  });

  const { data: modelPreview } = useQuery({
    queryKey: ['model-preview', resource?.model_folder, resourceType],
    queryFn: () => getModelPreview(resource!.model_folder, resourceType),
    enabled: !!resource,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">加载中...</p>;
  if (error || !resource) {
    return (
      <div className="space-y-4">
        <Link to={`/${resourceType}`} className="inline-flex items-center text-sm text-primary">
          <ArrowLeft className="mr-1 h-4 w-4" /> 返回列表
        </Link>
        <p className="text-red-500">{error instanceof Error ? error.message : '资源不存在'}</p>
      </div>
    );
  }

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: '概览', icon: <Box className="h-4 w-4" /> },
    { key: 'assets', label: '资源文件', icon: <FolderTree className="h-4 w-4" /> },
    { key: 'preview', label: '预览', icon: <FileImage className="h-4 w-4" /> },
  ];

  const iconUrl = resource.official_db.icon_name
    ? getIconPreviewUrl(resource.official_db.icon_name, 64)
    : resource.official_db.spell_icon_name
      ? getIconPreviewUrl(resource.official_db.spell_icon_name, 64)
      : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center gap-4">
        <Link to={`/${resourceType}`} className="inline-flex items-center text-sm text-primary">
          <ArrowLeft className="mr-1 h-4 w-4" /> 返回列表
        </Link>
        <h1 className="text-xl font-semibold">{resource.name || resource.model_folder}</h1>
      </div>

      <div className="flex gap-2 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-1 border-b-2 px-3 py-2 text-sm font-medium',
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-md border p-4">
            <h2 className="font-medium">基本信息</h2>
            <dl className="grid grid-cols-[8rem_1fr] gap-2 text-sm">
              <dt className="text-muted-foreground">ID</dt>
              <dd>{resource.id}</dd>
              <dt className="text-muted-foreground">类型</dt>
              <dd>{resource.resource_type}</dd>
              <dt className="text-muted-foreground">模型文件夹</dt>
              <dd>{resource.model_folder}</dd>
              <dt className="text-muted-foreground">调试通过</dt>
              <dd>{resource.debug_passed ? '是' : '否'}</dd>
              <dt className="text-muted-foreground">已添加</dt>
              <dd>{resource.added ? '是' : '否'}</dd>
              {resource.mount_type && (
                <>
                  <dt className="text-muted-foreground">坐骑类型</dt>
                  <dd>{resource.mount_type}</dd>
                </>
              )}
              {resource.star_rating && (
                <>
                  <dt className="text-muted-foreground">星级</dt>
                  <dd>{resource.star_rating}</dd>
                </>
              )}
              {resource.subtype && (
                <>
                  <dt className="text-muted-foreground">子类型</dt>
                  <dd>{resource.subtype}</dd>
                </>
              )}
              {resource.rarity && (
                <>
                  <dt className="text-muted-foreground">稀有度</dt>
                  <dd>{resource.rarity}</dd>
                </>
              )}
            </dl>
          </div>

          <div className="space-y-3 rounded-md border p-4">
            <h2 className="font-medium">官方数据库信息</h2>
            <dl className="grid grid-cols-[8rem_1fr] gap-2 text-sm">
              <dt className="text-muted-foreground">名称</dt>
              <dd>{resource.official_db.name || '-'}</dd>
              <dt className="text-muted-foreground">图标名称</dt>
              <dd>{resource.official_db.icon_name || '-'}</dd>
              <dt className="text-muted-foreground">法术图标</dt>
              <dd>{resource.official_db.spell_icon_name || '-'}</dd>
            </dl>
            {iconUrl && (
              <div className="pt-2">
                <img
                  src={iconUrl}
                  alt="icon"
                  className="h-16 w-16 rounded-md border object-contain"
                />
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-md border p-4 md:col-span-2">
            <h2 className="font-medium">DBC / DB 元数据</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <JsonBlock title="creature_model_data" data={resource.dbc.creature_model_data} />
              <JsonBlock title="creature_display_info" data={resource.dbc.creature_display_info} />
              <JsonBlock title="spell" data={resource.dbc.spell} />
              <JsonBlock title="item" data={resource.dbc.item} />
              <JsonBlock title="creature_template" data={resource.db.creature_template} />
              <JsonBlock title="creature_model_info" data={resource.db.creature_model_info} />
              <JsonBlock title="item_template" data={resource.db.item_template} />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'assets' && assets && (
        <div className="grid gap-4 md:grid-cols-2">
          <AssetFileTree title="M2 模型" icon=<Box className="h-4 w-4" /> files={assets.m2_files} />
          <AssetFileTree title="贴图文件" icon=<Layers className="h-4 w-4" /> files={assets.texture_files} />
          <AssetFileTree title="图片文件" icon=<FileImage className="h-4 w-4" /> files={assets.image_files} />
          <AssetFileTree title="图标文件" icon=<Layers className="h-4 w-4" /> files={assets.icon_files} />
        </div>
      )}

      {activeTab === 'preview' && (
        <div className="space-y-4">
          {modelPreview && (
            <ModelViewer preview={modelPreview} resourceType={resourceType} />
          )}
          {assets && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {assets.matched_textures.map((file) => (
                <TextureViewer key={file.relative_path} path={file.relative_path} label={file.name} />
              ))}
              {assets.image_files.map((file) => (
                <TextureViewer key={file.relative_path} path={file.relative_path} label={file.name} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function JsonBlock({ title, data }: { title: string; data: Record<string, unknown> }) {
  const keys = Object.keys(data);
  if (keys.length === 0) return null;
  return (
    <div className="rounded-md border p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
