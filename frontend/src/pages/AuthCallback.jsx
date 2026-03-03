import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    // Supabase handles the OAuth callback automatically
    // Just redirect after session is established
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        navigate('/dashboard', { replace: true })
      } else if (event === 'SIGNED_OUT') {
        navigate('/', { replace: true })
      }
    })

    // Timeout fallback
    const timer = setTimeout(() => navigate('/', { replace: true }), 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [navigate])

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-14 h-14 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <h2 className="text-xl font-semibold text-white">Signing you in...</h2>
        <p className="text-slate-400 text-sm">Redirecting to your dashboard</p>
      </div>
    </div>
  )
}
