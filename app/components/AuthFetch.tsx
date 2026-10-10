'use client'
import { instalarAuthFetch } from '../lib/authFetch'

// Instala o interceptor de autenticação já na avaliação do módulo (antes dos efeitos das páginas).
instalarAuthFetch()

export default function AuthFetch() {
  return null
}
