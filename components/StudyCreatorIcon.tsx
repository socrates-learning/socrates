import styles from './StudyCreatorClient.module.css';

type IconName =
  | 'book'
  | 'card'
  | 'chevron-down'
  | 'chevron-right'
  | 'folder'
  | 'more'
  | 'pencil'
  | 'search'
  | 'trash';

export function StudyCreatorIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v14H6.5A2.5 2.5 0 0 0 4 19.5z" /><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v14h4.5a2.5 2.5 0 0 1 2.5 2.5z" /></>,
    card: <><path d="M6 2.75h8l4 4V21.25H6z" /><path d="M14 2.75v4h4M9 12h6M9 16h6" /></>,
    'chevron-down': <path d="m7 9.5 5 5 5-5" />,
    'chevron-right': <path d="m9.5 7 5 5-5 5" />,
    folder: <path d="M3 6.5h6l2-2h4.5A2.5 2.5 0 0 1 18 7v1H5.5A2.5 2.5 0 0 0 3 10.5zm0 4A2.5 2.5 0 0 1 5.5 8H21l-2 11.5H3z" />,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    pencil: <><path d="m4 20 4.25-1 10.5-10.5-3.25-3.25L5 15.75z" /><path d="m13.75 7 3.25 3.25" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4 4" /></>,
    trash: <><path d="M4 7h16M9 3h6l1 4H8zM6 7l1 14h10l1-14M10 11v6M14 11v6" /></>,
  };

  return (
    <svg aria-hidden="true" className={styles.svgIcon} fill="none" viewBox="0 0 24 24">
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
        {paths[name]}
      </g>
    </svg>
  );
}
