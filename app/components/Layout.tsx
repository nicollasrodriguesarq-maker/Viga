'use client'
import { ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import AlertsBell from './AlertsBell'
import { obterMinhasPermissoes, temAcessoModulo, type Permissoes } from '../lib/permissoes'

interface NavItem {
  icon: string
  label: string
  href: string
  disabled?: boolean
  modulo?: string
}

const NAV: NavItem[] = [
  { icon: 'dashboard', label: 'Dashboard', href: '/' },
  { icon: 'construction', label: 'Obras & Projetos', href: '/obras', modulo: 'obras' },
  { icon: 'account_balance_wallet', label: 'Financeiro', href: '/financeiro', modulo: 'financeiro' },
  { icon: 'architecture', label: 'Levantamento', href: '/levantamento', modulo: 'levantamento' },
  { icon: 'work', label: 'Orçamento', href: '/orcamento', modulo: 'orcamento' },
  { icon: 'inventory_2', label: 'Suprimentos', href: '/suprimentos', disabled: true },
  { icon: 'group', label: 'Clientes & CRM', href: '/crm', disabled: true },
  { icon: 'assignment', label: 'Equipes & Tarefas', href: '/equipes', disabled: true },
  { icon: 'calendar_today', label: 'Agenda', href: '/agenda', disabled: true },
]

interface LayoutProps {
  children: ReactNode
  userEmail: string
  onLogout: () => void
  topbarSlot?: ReactNode
  searchSlot?: ReactNode
  headerTitle?: string
}

export default function Layout({ children, userEmail, onLogout, topbarSlot, searchSlot, headerTitle }: LayoutProps) {
  const pathname = usePathname()
  const nomeUsuario = userEmail.split('@')[0] || 'usuário'
  const inicial = nomeUsuario.charAt(0).toUpperCase()
  const [permissoes, setPermissoes] = useState<Permissoes | null>(null)

  useEffect(() => { obterMinhasPermissoes().then(setPermissoes) }, [])

  const navVisivel = NAV.filter(item => !item.modulo || temAcessoModulo(permissoes, item.modulo))

  return (
    <div className="min-h-screen bg-background text-on-background font-body-md">
      <aside className="w-64 h-screen fixed left-0 top-0 flex flex-col border-r border-outline-variant bg-surface-container z-50">
        <div className="px-lg py-xl flex flex-col gap-xs">
          <h1 className="font-headline text-headline-lg font-black text-primary uppercase tracking-tighter">VIGA</h1>
          <p className="font-label-sm text-label-sm text-on-surface-variant opacity-70 tracking-widest">GESTÃO INTEGRADA</p>
        </div>
        <nav className="flex-1 overflow-y-auto custom-scrollbar px-sm py-md">
          <ul className="flex flex-col gap-1">
            {navVisivel.map((item) => {
              const ativo = item.href === pathname
              if (item.disabled) {
                return (
                  <li key={item.href}>
                    <div className="flex items-center gap-3 px-4 py-3 text-on-surface-variant opacity-40 pointer-events-none">
                      <span className="material-symbols-outlined">{item.icon}</span>
                      <span className="font-label-md text-label-md">{item.label}</span>
                    </div>
                  </li>
                )
              }
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={
                      ativo
                        ? 'flex items-center gap-3 px-4 py-3 text-primary bg-primary/10 border-r-4 border-primary font-bold transition-colors'
                        : 'flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/50 transition-colors'
                    }
                  >
                    <span className="material-symbols-outlined">{item.icon}</span>
                    <span className="font-label-md text-label-md">{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="p-md border-t border-outline-variant flex flex-col gap-md">
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold">
              {inicial}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="font-label-md text-label-md text-on-surface truncate">{nomeUsuario}</span>
              <span className="text-[10px] uppercase text-on-surface-variant">Diretor • Inverso</span>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-error-container/20 text-error hover:bg-error-container/40 transition-all rounded-xl font-bold"
          >
            <span className="material-symbols-outlined">logout</span>
            <span className="font-label-md text-label-md">Sair</span>
          </button>
        </div>
      </aside>

      <header className="ml-64 h-20 w-[calc(100%-16rem)] sticky top-0 z-40 bg-background/95 backdrop-blur-sm px-lg flex items-center justify-between">
        <div className="flex items-center flex-1 max-w-[36rem]">
          {searchSlot ?? (headerTitle && <h2 className="font-headline text-headline-sm text-on-surface">{headerTitle}</h2>)}
        </div>
        <div className="flex items-center gap-md">
          <AlertsBell />
          <Link
            href="/configuracoes"
            className="material-symbols-outlined p-2 text-on-surface-variant hover:bg-primary-container/10 rounded-xl transition-all cursor-pointer"
          >
            settings
          </Link>
          {topbarSlot && <div className="h-8 w-[1px] bg-outline-variant" />}
          {topbarSlot}
        </div>
      </header>

      <main className="ml-64 p-lg overflow-y-auto h-[calc(100vh-5rem)] custom-scrollbar">
        {children}
      </main>
    </div>
  )
}
