import {useEffect,useState} from 'react';
import {Link,NavLink,useLocation,useNavigate} from 'react-router-dom';
import {useAuth} from './AuthContext.jsx';
import Avatar from './Avatar.jsx';
import ActionMenu from './components/ActionMenu.jsx';
import {useToast} from './components/ToastProvider.jsx';

function Icon({name}){
  const paths={
    courses:<><rect x="3" y="5" width="8" height="14" rx="1.5"/><rect x="13" y="5" width="8" height="14" rx="1.5"/><path d="M11 8c-2-1.3-4.7-1.6-8-1.1M13 8c2-1.3 4.7-1.6 8-1.1"/></>,
    ranking:<><path d="M4 20V11h4v9M10 20V4h4v16M16 20v-6h4v6M2 20h20"/></>,
    plans:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h4M7 17h7"/></>,
    overview:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    manage:<><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="white"/><circle cx="16" cy="12" r="2" fill="white"/><circle cx="10" cy="18" r="2" fill="white"/></>
  };
  return <svg className="app-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function NavBar(){
  const toast=useToast();
  const {user,authReady,isAdmin,logout}=useAuth();
  const navigate=useNavigate(),location=useLocation();
  const [busy,setBusy]=useState(false),[menuOpen,setMenuOpen]=useState(false);
  useEffect(()=>setMenuOpen(false),[location.pathname]);
  useEffect(()=>{if(!menuOpen)return;const close=e=>{if(e.key==='Escape')setMenuOpen(false);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[menuOpen]);
  async function handleLogout(){setBusy(true);try{await logout();toast.success('ออกจากระบบแล้ว');navigate('/login',{replace:true});}catch(e){toast.error('ออกจากระบบไม่สำเร็จ',e.message);}finally{setBusy(false);}}
  const links=[['/','รายวิชา','courses'],['/dashboard','อันดับรายวิชา','ranking'],['/plans','แผนการเรียน','plans']];
  const adminLinks=[['/admin/dashboard','ภาพรวมแอดมิน','overview'],['/admin','จัดการรายวิชา','manage']];
  const renderLink=([to,label,icon])=><NavLink key={to} to={to} end={to==='/'||to==='/admin'} className={({isActive})=>`app-side-link ${isActive||(to==='/'&&/^\/courses?(\/|$)/.test(location.pathname))?'active':''}`} onClick={()=>setMenuOpen(false)}><Icon name={icon}/><span>{label}</span></NavLink>;
  return <>
    <header className="app-topbar"><a className="ux-skip" href="#main-content">ข้ามไปเนื้อหา</a><div className="app-topbar-brand"><button type="button" className="app-menu-toggle" aria-label={menuOpen?'ปิดเมนู':'เปิดเมนู'} aria-controls="app-sidebar" aria-expanded={menuOpen} onClick={()=>setMenuOpen(open=>!open)}><span aria-hidden="true">☰</span></button><Link to="/" className="app-brand" onClick={()=>setMenuOpen(false)}><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M2 11 16 4l14 7-14 7L2 11Z" fill="currentColor"/><path d="M8 16v7c5 4 11 4 16 0v-7l-8 4-8-4Z" fill="currentColor"/><path d="M29 12v10" fill="none" stroke="currentColor" strokeWidth="2"/></svg><span>Course <em>Coach</em></span></Link></div>
      <div className="app-topbar-actions">{!authReady?<span className="ux-auth-placeholder" aria-label="กำลังตรวจสอบบัญชี"/>:user?<ActionMenu label="เมนูบัญชีของฉัน" className="ux-account-menu" trigger={<><Avatar url={user.avatar_url} size={34}/><span className="ux-account-name">{user.display_name}</span><span aria-hidden="true">⌄</span></>}><Link to={`/profile/${user.user_id}`}>โปรไฟล์ของฉัน</Link><button disabled={busy} type="button" onClick={handleLogout}>ออกจากระบบ</button></ActionMenu>:<Link to="/login" className="btn btn-ghost">เข้าสู่ระบบ</Link>}</div>
    </header>
    <button type="button" className={`app-sidebar-scrim ${menuOpen?'is-visible':''}`} aria-label="ปิดเมนู" tabIndex={menuOpen?0:-1} onClick={()=>setMenuOpen(false)}/>
    <aside id="app-sidebar" className={`app-sidebar ${menuOpen?'is-open':''}`} aria-label="เมนูเว็บไซต์"><nav className="app-side-nav" aria-label="เมนูหลัก">{links.map(renderLink)}{isAdmin&&<><div className="app-nav-divider"/><span className="app-nav-group">สำหรับผู้ดูแล</span>{adminLinks.map(renderLink)}</>}</nav></aside>
  </>;
}
