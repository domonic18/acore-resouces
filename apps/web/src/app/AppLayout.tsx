import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/shared/utils';

const navItems = [
  { label: '坐骑', path: '/mounts' },
  { label: '宠物', path: '/pets' },
  { label: 'NPC', path: '/npcs' },
];

export function AppLayout() {
  return (
    <div className="flex h-screen flex-col">
      <header className="border-b bg-card px-4 py-3">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-semibold">acore-resouces</h1>
          <nav className="flex gap-4">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn('text-sm font-medium hover:text-primary', isActive && 'text-primary')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1 overflow-auto p-4">
        <Outlet />
      </main>
    </div>
  );
}
