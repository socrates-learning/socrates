import { createSupabaseServerClient } from '@/lib/supabase-server';
import type { ActiveLibraryContext } from '@/lib/library-context';

export async function LibrarySwitcher({
  context,
  returnTo,
}: {
  context: ActiveLibraryContext;
  returnTo?: string;
}) {
  if (!context.canSwitch) return null;

  const supabase = await createSupabaseServerClient();
  const { data: libraries } = await supabase
    .from('libraries')
    .select('id, name, slug')
    .eq('status', 'active')
    .order('name');

  if (!libraries?.length) return null;

  return (
    <form
      action="/library/switch"
      method="post"
      className="card"
      style={{
        display: 'flex',
        gap: '10px',
        alignItems: 'end',
        flexWrap: 'wrap',
      }}
    >
      <label style={{ minWidth: 220 }}>
        <strong>Working library</strong>
        <select
          name="library_slug"
          defaultValue={context.library?.slug || ''}
          aria-label="Working library"
        >
          {libraries.map((library) => (
            <option key={library.id} value={library.slug}>
              {library.name}
            </option>
          ))}
        </select>
      </label>

      {returnTo && <input type="hidden" name="return_to" value={returnTo} />}

      <button className="btn ghost" type="submit">
        Switch
      </button>
    </form>
  );
}
