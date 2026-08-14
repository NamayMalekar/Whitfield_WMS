import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  ClipboardList,
  Contrast,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MessageSquareText,
  Moon,
  PackageSearch,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useWarehouse } from '../context/WarehouseContext'
import { useTheme } from '../context/ThemeContext'
import { RoleBadge, Segmented } from './ui'
import Wordmark from './Wordmark'

const LINKS = [
  { to: '/', label: 'Floor', icon: LayoutDashboard, end: true, title: 'Floor status' },
  { to: '/receiving', label: 'Receiving', icon: PackageSearch, permission: 'inventory:receive', title: 'Receiving' },
  { to: '/fulfillment', label: 'Fulfillment', icon: ClipboardList, permission: 'order:read', title: 'Fulfillment' },
  { to: '/scripts', label: 'Checks', icon: ListChecks, permission: 'script:run', title: 'Routine checks' },
  { to: '/assistant', label: 'Assistant', icon: MessageSquareText, permission: 'assistant:ask', title: 'Floor assistant' },
  { to: '/admin', label: 'Admin', icon: ShieldCheck, permission: 'user:manage', title: 'Administration' },
]

export default function AppShell({ children }) {
  const { pathname } = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => setDrawerOpen(false), [pathname])

  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] border-r border-line bg-paper lg:flex lg:flex-col">
        <SidebarBody />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="animate-fade absolute inset-0"
            style={{ background: 'var(--scrim)', backdropFilter: 'blur(4px)' }}
          />
          <div className="animate-rise absolute inset-y-0 left-0 flex w-[272px] flex-col border-r border-line bg-paper">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="icon-btn absolute right-2 top-3"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarBody />
          </div>
        </div>
      )}

      <div className="lg:pl-[248px]">
        <TopBar onOpenMenu={() => setDrawerOpen(true)} />
        <main className="mx-auto w-full max-w-[1180px] px-4 py-7 sm:px-6 lg:px-9 lg:py-9">
          {children}
        </main>
      </div>
    </div>
  )
}

function SidebarBody() {
  const { user, logout, can } = useAuth()
  const { warehouses } = useWarehouse()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const navRef = useRef(null)
  const itemRefs = useRef([])
  const [marker, setMarker] = useState({ top: 0, height: 0, ready: false })

  const links = LINKS.filter((link) => !link.permission || can(link.permission))
  const activeIndex = links.findIndex((link) =>
    link.end ? pathname === link.to : pathname.startsWith(link.to),
  )

  // The active pill is one element that slides, rather than six that fade.
  useLayoutEffect(() => {
    const node = itemRefs.current[activeIndex]
    if (!node) {
      setMarker((current) => ({ ...current, ready: false }))
      return
    }
    setMarker({ top: node.offsetTop, height: node.offsetHeight, ready: true })
  }, [activeIndex, links.length])

  const signOut = () => {
    logout()
    navigate('/login')
  }

  return (
    <>
      <div className="px-6 pb-2 pt-7">
        <Wordmark />
        <p className="mt-2 text-[0.6875rem] font-medium text-slate">
          {warehouses.map((w) => w.city).join(' · ') || 'Reno · Columbus'}
        </p>
      </div>

      <nav ref={navRef} className="relative mt-6 flex-1 space-y-1 px-3" aria-label="Sections">
        <span
          aria-hidden="true"
          className="absolute left-3 right-3 rounded-xl bg-mist transition-all duration-300 ease-ease"
          style={{
            top: marker.top,
            height: marker.height,
            opacity: marker.ready ? 1 : 0,
          }}
        />
        {links.map((link, index) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            ref={(node) => {
              itemRefs.current[index] = node
            }}
            className={({ isActive }) =>
              `relative z-10 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.9375rem]
               font-medium transition-colors duration-200
               ${isActive ? 'text-ink' : 'text-slate hover:text-ink'}`
            }
          >
            <link.icon
              className="h-[1.125rem] w-[1.125rem] shrink-0"
              style={index === activeIndex ? { color: 'var(--cobalt)' } : undefined}
              aria-hidden="true"
            />
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-semibold"
            style={{ background: 'var(--cobalt-soft)', color: 'var(--cobalt)' }}
            aria-hidden="true"
          >
            {initials(user?.full_name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user?.full_name}</p>
            <RoleBadge role={user?.role} />
          </div>
        </div>
        <button type="button" onClick={signOut} className="btn-bare mt-1 w-full justify-start px-3">
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </>
  )
}

function TopBar({ onOpenMenu }) {
  const { warehouses, active, setActive } = useWarehouse()
  const { theme, cycle } = useTheme()
  const { pathname } = useLocation()

  const current = LINKS.find((link) => (link.end ? pathname === link.to : pathname.startsWith(link.to)))
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Contrast
  const themeLabel = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'High contrast'

  return (
    <header className="glass sticky top-0 z-30 border-b border-line">
      <div className="mx-auto flex w-full max-w-[1180px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-9">
        <button type="button" onClick={onOpenMenu} className="icon-btn lg:hidden" aria-label="Open menu">
          <MenuGlyph />
        </button>

        <p className="truncate font-display text-[0.9375rem] font-semibold tracking-tight lg:text-base">
          {current?.title || 'Whitfield'}
        </p>

        <div className="ml-auto flex items-center gap-2">
          {warehouses.length > 1 &&
            (warehouses.length <= 3 ? (
              <Segmented
                ariaLabel="Active warehouse"
                className="min-w-[184px]"
                value={active}
                onChange={setActive}
                options={warehouses.map((warehouse) => ({
                  value: warehouse.code,
                  label: warehouse.city,
                }))}
              />
            ) : (
              <select
                aria-label="Active warehouse"
                className="field w-auto py-2"
                value={active}
                onChange={(event) => setActive(event.target.value)}
              >
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.code}>
                    {warehouse.city}
                  </option>
                ))}
              </select>
            ))}

          <button
            type="button"
            onClick={cycle}
            className="icon-btn"
            title={`Display: ${themeLabel}. Click for the next mode.`}
            aria-label={`Display mode: ${themeLabel}. Change`}
          >
            <ThemeIcon className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  )
}

function MenuGlyph() {
  return (
    <span className="flex h-4 w-[1.125rem] flex-col justify-between" aria-hidden="true">
      <i className="block h-[2px] w-full rounded-full bg-current" />
      <i className="block h-[2px] w-[70%] rounded-full bg-current" />
      <i className="block h-[2px] w-full rounded-full bg-current" />
    </span>
  )
}

function initials(name = '') {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '—'
  )
}
