import { useState, type FormEvent } from 'react'
import { z } from 'zod'
import { KeyRound, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { errorEnUrl, mensajeErrorAuth } from '../lib/errores-auth'
import { Marca } from '../components/Marca'

const emailSchema = z.email({ message: 'Revisá el mail: parece que está mal escrito.' })
const codigoSchema = z
  .string()
  .regex(/^\d{6,10}$/, { message: 'El código son los números que te llegaron por mail.' })

type Modo = 'clave' | 'codigo' | 'codigo_enviado'

function limpiarUrl() {
  if (window.location.hash || window.location.search) {
    window.history.replaceState(null, '', window.location.pathname)
  }
}

export function Login() {
  const [modo, setModo] = useState<Modo>('clave')
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [codigo, setCodigo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(() => {
    const deLaUrl = errorEnUrl(new URL(window.location.href))
    if (deLaUrl) limpiarUrl()
    return deLaUrl
  })

  function validarEmail(): string | null {
    const r = emailSchema.safeParse(email.trim())
    if (!r.success) {
      setError(r.error.issues[0]?.message ?? 'Revisá el mail.')
      return null
    }
    return r.data
  }

  async function entrarConClave(e: FormEvent) {
    e.preventDefault()
    const mail = validarEmail()
    if (!mail) return
    if (!clave) return setError('Escribí tu contraseña.')
    setEnviando(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: mail, password: clave })
    setEnviando(false)
    if (error) setError(mensajeErrorAuth(error))
  }

  async function mandarCodigo(e?: FormEvent) {
    e?.preventDefault()
    const mail = validarEmail()
    if (!mail) return
    setEnviando(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email: mail,
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
    })
    setEnviando(false)
    if (error) return setError(mensajeErrorAuth(error))
    setModo('codigo_enviado')
  }

  async function entrarConCodigo(e: FormEvent) {
    e.preventDefault()
    const r = codigoSchema.safeParse(codigo.trim())
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá el código.')
    setEnviando(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: r.data,
      type: 'email',
    })
    setEnviando(false)
    if (error) setError(mensajeErrorAuth(error))
  }

  function cambiarModo(m: Modo) {
    setModo(m)
    setError('')
  }

  return (
    <div className="app">
      <main className="app__contenido app__contenido--sin-barra">
        <header className="encabezado">
          <Marca />
        </header>

        <div>
          <div className="sobretitulo">Compras y recepción</div>
          <h1>Entrá a tu bar</h1>
        </div>

        {modo === 'clave' && (
          <form className="card formulario" onSubmit={entrarConClave} noValidate>
            <CampoEmail valor={email} onChange={setEmail} />
            <label className="campo">
              <span className="campo__etiqueta">Contraseña</span>
              <input
                type="password"
                autoComplete="current-password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
              />
            </label>
            {error && <Aviso texto={error} />}
            <button className="boton boton--primario" disabled={enviando}>
              <KeyRound size={18} aria-hidden="true" />
              {enviando ? 'Entrando…' : 'Entrar'}
            </button>
            <button
              type="button"
              className="boton boton--texto"
              onClick={() => cambiarModo('codigo')}
            >
              No tengo contraseña: mandame un mail para entrar
            </button>
          </form>
        )}

        {modo === 'codigo' && (
          <form className="card formulario" onSubmit={mandarCodigo} noValidate>
            <p className="formulario__ayuda">Te mandamos un mail para entrar, sin contraseña.</p>
            <CampoEmail valor={email} onChange={setEmail} />
            {error && <Aviso texto={error} />}
            <button className="boton boton--primario" disabled={enviando}>
              <Mail size={18} aria-hidden="true" />
              {enviando ? 'Mandando…' : 'Mandame el mail'}
            </button>
            <button
              type="button"
              className="boton boton--texto"
              onClick={() => cambiarModo('clave')}
            >
              Entrar con contraseña
            </button>
          </form>
        )}

        {modo === 'codigo_enviado' && (
          <form className="card formulario" onSubmit={entrarConCodigo} noValidate>
            <p className="formulario__ayuda">
              Te mandamos un mail a <strong>{email.trim()}</strong>. Tocá el enlace desde este mismo
              dispositivo. Si el mail trae un código, escribilo acá.
            </p>
            <label className="campo">
              <span className="campo__etiqueta">Código</span>
              <input
                className="mono"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            {error && <Aviso texto={error} />}
            <button className="boton boton--primario" disabled={enviando}>
              {enviando ? 'Entrando…' : 'Entrar'}
            </button>
            <button
              type="button"
              className="boton boton--texto"
              disabled={enviando}
              onClick={() => mandarCodigo()}
            >
              No me llegó: mandalo de nuevo
            </button>
            <button
              type="button"
              className="boton boton--texto"
              onClick={() => cambiarModo('codigo')}
            >
              Cambiar el mail
            </button>
          </form>
        )}
      </main>
    </div>
  )
}

function CampoEmail({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return (
    <label className="campo">
      <span className="campo__etiqueta">Mail</span>
      <input
        type="email"
        inputMode="email"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

function Aviso({ texto }: { texto: string }) {
  return (
    <p className="aviso aviso--error" role="alert">
      {texto}
    </p>
  )
}
