'use client'
import { ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { obterMinhasPermissoesApp, temAcessoModuloApp, type PermissoesApp } from '../../lib/permissoes'

interface NavItem {
  icon: string
  label: string
  href: string
  modulo?: string
}

const NAV: NavItem[] = [
  { icon: 'dashboard', label: 'Início', href: '/m' },
  { icon: 'construction', label: 'Obras', href: '/m/obras', modulo: 'obras' },
  { icon: 'account_balance_wallet', label: 'Financeiro', href: '/m/financeiro', modulo: 'financeiro' },
  { icon: 'architecture', label: 'Levant.', href: '/m/levantamento', modulo: 'levantamento' },
  { icon: 'work', label: 'Orçamento', href: '/m/orcamento', modulo: 'orcamento' },
]

interface MobileShellProps {
  children: ReactNode
  title: string
}

export default function MobileShell({ children, title }: MobileShellProps) {
  const pathname = usePathname()
  const [permissoes, setPermissoes] = useState<PermissoesApp | null>(null)

  useEffect(() => { obterMinhasPermissoesApp().then(setPermissoes) }, [])

  const navVisivel = NAV.filter(item => !item.modulo || temAcessoModuloApp(permissoes, item.modulo))

  return (
    <div className="min-h-screen bg-background text-on-background font-body-md flex flex-col">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm px-4 h-14 flex items-center border-b border-outline-variant">
        <h1 className="font-headline text-headline-sm text-on-surface truncate">{title}</h1>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface-container border-t border-outline-variant pb-[env(safe-area-inset-bottom)]">
        <ul className="flex items-stretch">
          {navVisivel.map(item => {
            const ativo = item.href === '/m' ? pathname === '/m' : pathname.startsWith(item.href)
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  className={
                    ativo
                      ? 'flex flex-col items-center justify-center gap-0.5 py-2 text-primary'
                      : 'flex flex-col items-center justify-center gap-0.5 py-2 text-on-surface-variant'
                  }
                >
                  <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
                  <span className="text-[10px] font-semibold leading-none">{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
