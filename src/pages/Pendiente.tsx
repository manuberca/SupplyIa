type Props = { titulo: string; etapa: number }

export function Pendiente({ titulo, etapa }: Props) {
  return (
    <>
      <h1>{titulo}</h1>
      <section className="card pendiente">
        <p>Esta pantalla se arma en la etapa {etapa}.</p>
        <p className="texto-gris">Por ahora solo está la estructura de la app.</p>
      </section>
    </>
  )
}
