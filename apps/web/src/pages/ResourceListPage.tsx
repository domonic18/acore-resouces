import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { listResources } from '@/shared/resources';
import { cn } from '@/shared/utils';

export function ResourceListPage() {
  const { resourceType = 'mount' } = useParams<{ resourceType: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');

  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = 20;

  const { data, isLoading, error } = useQuery({
    queryKey: ['resources', resourceType, searchParams.toString()],
    queryFn: () =>
      listResources(resourceType, {
        search: searchParams.get('search') || undefined,
        added: searchParams.has('added') ? searchParams.get('added') === 'true' : undefined,
        debug_passed: searchParams.has('debug_passed')
          ? searchParams.get('debug_passed') === 'true'
          : undefined,
        page,
        page_size: pageSize,
      }),
  });

  const applySearch = () => {
    const next = new URLSearchParams(searchParams);
    if (search) {
      next.set('search', search);
    } else {
      next.delete('search');
    }
    next.set('page', '1');
    setSearchParams(next);
  };

  const toggleFilter = (key: string) => {
    const next = new URLSearchParams(searchParams);
    const current = next.get(key);
    if (current === 'true') {
      next.set(key, 'false');
    } else if (current === 'false') {
      next.delete(key);
    } else {
      next.set(key, 'true');
    }
    next.set('page', '1');
    setSearchParams(next);
  };

  const goToPage = (newPage: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(newPage));
    setSearchParams(next);
  };

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applySearch()}
            placeholder="搜索名称或模型文件夹..."
            className="w-full rounded-md border bg-background px-3 py-2 pl-9 text-sm outline-none focus:ring-1 focus:ring-primary"
          />
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        </div>
        <button
          onClick={applySearch}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          搜索
        </button>
        <button
          onClick={() => toggleFilter('added')}
          className={cn(
            'rounded-md border px-3 py-2 text-sm',
            searchParams.get('added') === 'true' && 'bg-primary text-primary-foreground',
          )}
        >
          已添加
        </button>
        <button
          onClick={() => toggleFilter('debug_passed')}
          className={cn(
            'rounded-md border px-3 py-2 text-sm',
            searchParams.get('debug_passed') === 'true' && 'bg-primary text-primary-foreground',
          )}
        >
          调试通过
        </button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">加载中...</p>}
      {error && (
        <p className="text-sm text-red-500">加载失败：{error instanceof Error ? error.message : String(error)}</p>
      )}

      {data && (
        <>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">ID</th>
                  <th className="px-4 py-2 text-left font-medium">名称</th>
                  <th className="px-4 py-2 text-left font-medium">模型文件夹</th>
                  <th className="px-4 py-2 text-left font-medium">调试通过</th>
                  <th className="px-4 py-2 text-left font-medium">已添加</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.items.map((resource) => (
                  <tr key={resource.id} className="hover:bg-muted/50">
                    <td className="px-4 py-2">{resource.id}</td>
                    <td className="px-4 py-2">
                      <Link
                        to={`/${resourceType}/${resource.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {resource.name || resource.model_folder}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{resource.model_folder}</td>
                    <td className="px-4 py-2">{resource.debug_passed ? '是' : '否'}</td>
                    <td className="px-4 py-2">{resource.added ? '是' : '否'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              共 {data.total} 条，第 {data.page} / {totalPages || 1} 页
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
                className="flex items-center rounded-md border px-3 py-2 text-sm disabled:opacity-50"
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> 上一页
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => goToPage(page + 1)}
                className="flex items-center rounded-md border px-3 py-2 text-sm disabled:opacity-50"
              >
                下一页 <ChevronRight className="ml-1 h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
