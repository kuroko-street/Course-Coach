import {useState} from 'react';
import {Link,NavLink,useNavigate} from 'react-router-dom';
import {useAuth} from './AuthContext.jsx';
import Avatar from './Avatar.jsx';
import ActionMenu from './components/ActionMenu.jsx';

export default function NavBar(){
  const {user,authReady,isAdmin,logout}=useAuth();const navigate=useNavigate();
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function handleLogout(){setBusy(true);try{await logout();navigate('/login',{replace:true});}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <header className="navbar ux-navbar"><a className="ux-skip" href="#main-content">ข้ามไปเนื้อหา</a><div className="navbar-inner">
    <Link to="/" className="brand"><span className="ux-brand-mark" aria-hidden="true">C</span>Course Coach</Link>
    <nav className="nav-links" aria-label="เมนูหลัก"><NavLink to="/" end className="nav-link">รายวิชา</NavLink><NavLink to="/dashboard" className="nav-link">อันดับรายวิชา</NavLink><NavLink to="/plans" className="nav-link">แผนการเรียน</NavLink>{isAdmin&&<NavLink to="/admin" className="nav-link">จัดการรายวิชา</NavLink>}</nav>
    <div className="nav-user">{!authReady?<span className="ux-auth-placeholder" aria-label="กำลังตรวจสอบบัญชี"/>:user?<ActionMenu label="เมนูบัญชีของฉัน" className="ux-account-menu" trigger={<><Avatar url={user.avatar_url} size={30}/><span className="ux-account-name">{user.display_name}</span><span aria-hidden="true">⌄</span></>}><Link to={`/profile/${user.user_id}`}>โปรไฟล์ของฉัน</Link><button disabled={busy} type="button" onClick={handleLogout}>ออกจากระบบ</button></ActionMenu>:<Link to="/login" className="btn btn-ghost">เข้าสู่ระบบ</Link>}</div>
  </div>{error&&<p role="alert" className="alert alert-error">{error}</p>}</header>;
}
