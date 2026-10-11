'use client'
import { instalarAuthFetch } from '../lib/authFetch'
import { instalarGuardaModal } from '../lib/guardaModal'

// Instalados já na avaliação do módulo (antes dos efeitos das páginas):
// - interceptor que autentica as chamadas ao banco com o token do usuário logado
// - guarda que impede janelas de fecharem ao selecionar texto e soltar o mouse fora delas
instalarAuthFetch()
instalarGuardaModal()

export default function AuthFetch() {
  return null
}
