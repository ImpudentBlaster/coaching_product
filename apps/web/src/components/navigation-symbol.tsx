const paths: Record<string, string> = {
  '⌂': 'M3 10 12 3l9 7M5 9v11h5v-6h4v6h5V9',
  '♙': 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-3a8 6 0 0 1 16 0v3',
  '✓': 'M5 12l4 4L19 6M20 13v7H4V4h9',
  '↗': 'M4 19 10 13l4 3 6-11M14 5h6v6',
  '✦': 'M4 4h16v12H9l-5 4V4ZM8 8h8M8 12h5',
  '▤': 'M6 3h12v18H6ZM9 7h6M9 11h6M9 15h4',
  '▦': 'M4 5h16v15H4ZM4 10h16M8 3v4M16 3v4M9 13v4M15 13v4',
  '◒': 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM7 12a5 5 0 0 0 5 5',
  '⌁': 'M5 19C3 8 9 3 20 4c0 11-5 17-15 15ZM5 19 15 9',
  '◫': 'M7 5v14M3 8v8M17 5v14M21 8v8M7 12h10',
  '＋': 'M12 4v16M4 12h16',
  '⚙': 'M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',
  '◇': 'm12 3 9 9-9 9-9-9 9-9ZM8 12h8',
};

export function NavigationSymbol({ symbol }: { symbol: string }) {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[symbol] ?? paths['◇']} /></svg>;
}
