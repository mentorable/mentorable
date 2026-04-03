export default function ProgressSection({ title, subtitle, children }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h3 className='font-["Plus Jakarta Sans",sans-serif] text-sm font-bold text-zinc-900'>{title}</h3>
        {subtitle ? <p className="mt-1 text-xs text-zinc-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}
