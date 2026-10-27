/** Illustrated placeholder for instructors, separate from user avatars. */
export default function InstructorAvatar({size = 64}) {
  return <svg width={size} height={size} viewBox="0 0 80 80" fill="none" aria-hidden="true" style={{flexShrink: 0}}>
    <circle cx="40" cy="40" r="40" fill="#EAF2F5"/>
    <path d="M15 72c1-15 10-24 25-24s24 9 25 24" fill="#46667D"/>
    <path d="m32 49 8 12 8-12" fill="#FFF8ED"/>
    <path d="M35 42h10v10c-3 4-7 4-10 0V42Z" fill="#DFAB86"/>
    <ellipse cx="40" cy="30" rx="15" ry="18" fill="#F1C6A3"/>
    <path d="M25 30v-8c0-10 7-16 16-16 10 0 16 7 15 17l-1 8-4-11c-8 3-14 1-18-2l-5 12h-3Z" fill="#354554"/>
    <g stroke="#354554" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="27" y="27" width="11" height="8" rx="3" fill="#FFF" fillOpacity=".45"/>
      <rect x="42" y="27" width="11" height="8" rx="3" fill="#FFF" fillOpacity=".45"/>
      <path d="M38 30h4m-7 10c3 2 7 2 10 0"/>
    </g>
    <path d="M22 57c7-1 12 1 18 4 6-3 11-5 18-4v17c-7-1-12 0-18 3-6-3-11-4-18-3V57Z" fill="#FFF9EE" stroke="#C16C35" strokeWidth="2" strokeLinejoin="round"/>
    <path d="M40 61v16" stroke="#C16C35" strokeWidth="2"/>
    <path d="m27 63 8 2m-8 4 8 2m10-6 8-2m-8 8 8-2" stroke="#D6B58F" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>;
}
