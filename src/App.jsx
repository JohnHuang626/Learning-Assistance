import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, getDocs, collection, deleteDoc, writeBatch } from 'firebase/firestore';
import { 
  ClipboardList, Settings, LogIn, X, Plus, Trash2, Edit, FileDown, 
  Upload, Printer, AlertTriangle, CheckCircle, Info, ChevronDown
} from 'lucide-react';

const IS_PREVIEW_ENV = typeof __app_id !== 'undefined';
const APP_ID = IS_PREVIEW_ENV ? __app_id : 'learning-support-rollcall-sys';

// 使用者提供的專屬 Firebase Config
const firebaseConfig = IS_PREVIEW_ENV ? JSON.parse(__firebase_config) : {
  apiKey: "AIzaSyDenl7jwXIhY0Q8TCN0E2ueIWfJPQokkkY",
  authDomain: "learning-assistance-1d14e.firebaseapp.com",
  projectId: "learning-assistance-1d14e",
  storageBucket: "learning-assistance-1d14e.firebasestorage.app",
  messagingSenderId: "977406490408",
  appId: "1:977406490408:web:856ba068da330bac58021d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const ADMIN_PASSWORD = "teach123";

const STATUS_OPTIONS = [
  { val: 'present', label: '出席', colors: 'bg-green-100 text-green-800 border-green-200' },
  { val: 'absent_personal', label: '事假', colors: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { val: 'absent_sick', label: '病假', colors: 'bg-orange-100 text-orange-800 border-orange-200' },
  { val: 'absent_funeral', label: '喪假', colors: 'bg-gray-200 text-gray-800 border-gray-300' },
  { val: 'absent_official', label: '公假', colors: 'bg-blue-100 text-blue-800 border-blue-200' },
  { val: 'absent_other', label: '其他/曠課', colors: 'bg-red-100 text-red-800 border-red-200' }
];

const INITIAL_DATA = [
  { className: '英文7', teacher: '楊育珽', students: [{n:'李O明', c:'701', num:'1'}, {n:'陳O華', c:'702', num:'3'}] },
  { className: '英文8', teacher: '林佳秀', students: [{n:'張O芬', c:'801', num:'2'}, {n:'林O豪', c:'802', num:'5'}] },
  { className: '數學7', teacher: '鍾詩蘋', students: [{n:'吳O恩', c:'704', num:'6'}, {n:'劉O婷', c:'705', num:'12'}] },
  { className: '數學8', teacher: '呂宜軒', students: [{n:'陳O佑', c:'803', num:'4'}, {n:'黃O琪', c:'804', num:'9'}] },
  { className: '國文（合）', teacher: '顏銘志', students: [{n:'蔡O軒', c:'701', num:'15'}, {n:'楊O茹', c:'801', num:'20'}] }
];

const getColRef = (colName) => IS_PREVIEW_ENV ? collection(db, 'artifacts', APP_ID, 'public', 'data', colName) : collection(db, colName);
const getDocRef = (colName, docId) => IS_PREVIEW_ENV ? doc(db, 'artifacts', APP_ID, 'public', 'data', colName, docId) : doc(db, colName, docId);
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2);
const formatDate = (dateString) => new Date(dateString).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' });

export default function App() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState('rollcall'); // 'rollcall', 'admin'
  const [isAdmin, setIsAdmin] = useState(false);
  const [toast, setToast] = useState({ show: false, msg: '', type: 'success' });
  
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);

  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPwdInput, setAdminPwdInput] = useState('');
  const [loginError, setLoginError] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ show: false, type: '', id: '', name: '', onConfirm: null });

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
        showToast("認證失敗，請重整頁面", "error");
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const classesSnap = await getDocs(getColRef('classes'));
        
        if (classesSnap.empty) {
          console.log("Setting up initial data...");
          const batch = writeBatch(db);
          for (const cls of INITIAL_DATA) {
            const classId = `class_${generateId()}`;
            batch.set(getDocRef('classes', classId), { id: classId, name: cls.className, teacher: cls.teacher, createdAt: new Date().toISOString() });
            
            let stuNum = 1;
            for (const stu of cls.students) {
              const studentId = `stu_${generateId()}`;
              batch.set(getDocRef('students', studentId), {
                id: studentId, classId: classId, name: stu.n, originalClass: stu.c, originalNumber: stu.num, number: stuNum++, createdAt: new Date().toISOString()
              });
            }
          }
          await batch.commit();
        }

        await refreshData();
      } catch (error) {
        console.error("Fetch error:", error);
        showToast("資料載入失敗", "error");
      }
      setIsLoading(false);
    };

    fetchData();
  }, [user]);

  const refreshData = async () => {
    if (!user) return;
    const [cSnap, sSnap] = await Promise.all([
      getDocs(getColRef('classes')),
      getDocs(getColRef('students'))
    ]);
    
    const cData = cSnap.docs.map(d => d.data()).sort((a, b) => a.name.localeCompare(b.name));
    const sData = sSnap.docs.map(d => d.data());
    
    setClasses(cData);
    setStudents(sData);
  };

  const showToast = (msg, type = 'success') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: '', type: 'success' }), 3000);
  };

  const handleNavAdmin = () => {
    if (isAdmin) setView('admin');
    else {
      setAdminPwdInput('');
      setLoginError(false);
      setShowAdminLogin(true);
    }
  };

  const submitAdminLogin = () => {
    if (adminPwdInput === ADMIN_PASSWORD) {
      setIsAdmin(true);
      setShowAdminLogin(false);
      setView('admin');
      showToast("登入成功");
    } else {
      setLoginError(true);
    }
  };

  return (
    <React.Fragment>
      {/* 🌟 核心修復：強制覆蓋 Vite 預設會造成黑邊與置中的樣式 */}
      <style>{`
        html, body, #root {
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
          overflow-x: hidden !important;
          display: block !important;
        }
      `}</style>
      
      <div className="min-h-screen flex flex-col bg-gray-50 text-gray-800 font-sans w-full text-left">
        {/* Header */}
        <header className="bg-indigo-600 text-white shadow-md print:hidden w-full">
          <div className="w-full px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <ClipboardList className="w-6 h-6" />
              <h1 className="text-xl font-bold">學習扶助點名系統</h1>
            </div>
            <nav className="flex space-x-2">
              <button 
                onClick={() => setView('rollcall')}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center ${view === 'rollcall' ? 'bg-indigo-700' : 'hover:bg-indigo-500'}`}
              >
                教師點名
              </button>
              <button 
                onClick={handleNavAdmin}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center ${view === 'admin' ? 'bg-indigo-700' : 'hover:bg-indigo-500'}`}
              >
                <Settings className="w-4 h-4 mr-1" /> 管理後台
              </button>
            </nav>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-grow p-4 sm:p-6 lg:p-8 w-full bg-gray-50">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 text-indigo-600">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
              <p>系統載入中，請稍候...</p>
            </div>
          ) : (
            <>
              {view === 'rollcall' && <RollcallView classes={classes} students={students} user={user} showToast={showToast} />}
              {view === 'admin' && <AdminView classes={classes} students={students} user={user} refreshData={refreshData} showToast={showToast} setConfirmModal={setConfirmModal} />}
            </>
          )}
        </main>

        {}
        {showAdminLogin && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 px-4">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold flex items-center"><LogIn className="w-5 h-5 mr-2 text-indigo-600"/> 管理員登入</h3>
                <button onClick={() => setShowAdminLogin(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
              </div>
              <input 
                type="password" 
                value={adminPwdInput}
                onChange={(e) => setAdminPwdInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitAdminLogin()}
                placeholder="請輸入管理員密碼"
                style={{colorScheme: 'light'}}
                className="w-full border-gray-300 border rounded-md p-2 mb-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white text-gray-900"
              />
              {loginError && <p className="text-red-500 text-sm mb-4">密碼錯誤，請重試。</p>}
              <button onClick={submitAdminLogin} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded mt-2">登入</button>
            </div>
          </div>
        )}

        {confirmModal.show && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 px-4">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                <AlertTriangle className="text-red-600 w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold mb-2">確認刪除</h3>
              <p className="text-sm text-gray-500 mb-6">
                確定要刪除 <span className="font-bold text-gray-800">{confirmModal.name}</span> 嗎？此操作無法復原。
                {confirmModal.type === 'class' && <><br/><span className="text-red-500 mt-1 block">警告：這將同時刪除該班級下的所有學生及歷史點名紀錄！</span></>}
                {confirmModal.type === 'all_records' && <><br/><span className="text-red-500 mt-1 block">警告：這將刪除目前畫面上顯示的所有點名紀錄！</span></>}
              </p>
              <div className="flex justify-center space-x-3">
                <button onClick={() => setConfirmModal({show:false})} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-gray-800">取消</button>
                <button onClick={confirmModal.onConfirm} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">確定刪除</button>
              </div>
            </div>
          </div>
        )}

        <div className={`fixed bottom-5 right-5 transform transition-all duration-300 z-50 flex items-center px-6 py-3 rounded-lg shadow-lg text-white ${toast.show ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'} ${toast.type === 'error' ? 'bg-red-600' : toast.type === 'warning' ? 'bg-yellow-500' : 'bg-gray-800'}`}>
          {toast.type === 'error' ? <AlertTriangle className="w-5 h-5 mr-3" /> : <CheckCircle className="w-5 h-5 mr-3 text-green-400" />}
          <span>{toast.msg}</span>
        </div>
      </div>
    </React.Fragment>
  );
}

function RollcallView({ classes, students, user, showToast }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [hasExistingRecord, setHasExistingRecord] = useState(false);
  
  const [attendance, setAttendance] = useState({});
  const [generalNote, setGeneralNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedClass = classes.find(c => c.id === selectedClassId);
  const classStudents = students.filter(s => s.classId === selectedClassId).sort((a, b) => (parseInt(a.number)||999) - (parseInt(b.number)||999));

  useEffect(() => {
    const checkRecord = async () => {
      if (!user || !date || !selectedClassId) {
        setHasExistingRecord(false);
        return;
      }
      const recordId = `${date}_${selectedClassId}`;
      const docSnap = await getDoc(getDocRef('rollcall_records', recordId));
      if (docSnap.exists()) {
        setHasExistingRecord(true);
      } else {
        setHasExistingRecord(false);
      }
    };
    checkRecord();
  }, [date, selectedClassId, user]);

  useEffect(() => {
    const initialAtt = {};
    classStudents.forEach(stu => {
      initialAtt[stu.id] = { status: 'present', note: '' };
    });
    setAttendance(initialAtt);
    setGeneralNote('');
  }, [selectedClassId]);

  const handleSubmit = async () => {
    if (!date || !selectedClassId) return showToast("請選擇日期與班級", "error");
    setIsSubmitting(true);

    try {
      const recordId = `${date}_${selectedClassId}`;
      const attendanceData = classStudents.map(stu => ({
        studentId: stu.id,
        studentName: stu.name,
        status: attendance[stu.id]?.status || 'present',
        note: attendance[stu.id]?.note || ''
      }));

      await setDoc(getDocRef('rollcall_records', recordId), {
        id: recordId,
        date,
        classId: selectedClassId,
        className: selectedClass.name,
        teacher: selectedClass.teacher,
        generalNote: generalNote.trim(),
        attendance: attendanceData,
        timestamp: new Date().toISOString()
      });

      showToast("點名紀錄已成功送出！");
      setHasExistingRecord(true);
    } catch (err) {
      console.error(err);
      showToast("傳送失敗", "error");
    }
    setIsSubmitting(false);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 w-full mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-2 flex items-center">
        <ClipboardList className="text-indigo-600 w-6 h-6 mr-2" /> 課堂點名
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">上課日期</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{colorScheme: 'light'}} className="w-full border-gray-300 border rounded-md p-2 outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-gray-900" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">授課班級</label>
          <select value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)} className="w-full border-gray-300 border rounded-md p-2 outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-gray-900">
            <option value="">請選擇班級</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">授課教師</label>
          <input type="text" disabled value={selectedClass ? selectedClass.teacher : '選擇班級後自動帶入'} style={{colorScheme: 'light'}} className="w-full border-gray-300 border rounded-md p-2 bg-gray-100 text-gray-600" />
        </div>
      </div>

      {hasExistingRecord && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 flex items-start">
          <Info className="text-yellow-500 w-5 h-5 mr-3 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-700">提醒：此班級今日已有上課紀錄，再次送出將會<strong>覆蓋</strong>原有的出缺席紀錄。</p>
        </div>
      )}

      {!selectedClassId ? (
        <div className="text-center py-12 text-gray-400">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>請先選擇上課日期與授課班級，即可開始點名。</p>
        </div>
      ) : (
        <div>
          <div className="flex justify-between items-end mb-3">
            <h3 className="text-lg font-medium text-gray-900">學生名單</h3>
            <div className="text-sm text-gray-500">總人數：<span className="font-bold text-indigo-600">{classStudents.length}</span></div>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-lg mb-6">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-16">座號</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">姓名</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32">原班級</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">出缺席狀況</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {classStudents.length === 0 ? (
                  <tr><td colSpan="4" className="px-4 py-6 text-center text-gray-500">此班級尚無學生資料</td></tr>
                ) : classStudents.map((stu, idx) => (
                  <tr key={stu.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 text-sm text-gray-500">{stu.number || '-'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{stu.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{stu.originalClass || '-'}{stu.originalNumber ? ` (${stu.originalNumber}號)` : ''}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                        <select 
                          value={attendance[stu.id]?.status || 'present'}
                          onChange={(e) => setAttendance(prev => ({...prev, [stu.id]: { ...prev[stu.id], status: e.target.value }}))}
                          className={`w-32 border border-gray-300 rounded-md p-1.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-gray-900 ${STATUS_OPTIONS.find(o => o.val === (attendance[stu.id]?.status || 'present'))?.colors || ''}`}
                        >
                          {STATUS_OPTIONS.map(opt => <option key={opt.val} value={opt.val}>{opt.label}</option>)}
                        </select>
                        <input 
                          type="text" 
                          placeholder="個人備註(選填)" 
                          value={attendance[stu.id]?.note || ''}
                          onChange={(e) => setAttendance(prev => ({...prev, [stu.id]: { ...prev[stu.id], note: e.target.value }}))}
                          style={{colorScheme: 'light'}}
                          className="flex-grow border border-gray-300 rounded-md p-1.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-gray-900"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">課堂備註 (上課狀況、違規紀錄等)</label>
            <textarea 
              rows="3" 
              value={generalNote}
              onChange={(e) => setGeneralNote(e.target.value)}
              placeholder="請輸入課堂相關備註..."
              style={{colorScheme: 'light'}}
              className="w-full border border-gray-300 rounded-md p-2 outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-gray-900"
            ></textarea>
          </div>

          <div className="flex justify-end">
            <button 
              onClick={handleSubmit} 
              disabled={isSubmitting || classStudents.length === 0}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold py-2 px-6 rounded-md shadow-sm transition-colors flex items-center"
            >
              {isSubmitting ? '傳送中...' : '送出點名紀錄'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminView(props) {
  const [adminTab, setAdminTab] = useState('records');

  return (
    <div className="h-full flex flex-col space-y-4 w-full mx-auto">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2 flex space-x-2 print:hidden">
        <button 
          onClick={() => setAdminTab('records')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${adminTab === 'records' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          點名紀錄查詢
        </button>
        <button 
          onClick={() => setAdminTab('settings')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${adminTab === 'settings' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          名單設定
        </button>
      </div>

      {adminTab === 'records' ? <AdminRecords {...props} /> : <AdminSettings {...props} />}
    </div>
  );
}

function AdminRecords({ classes, user, showToast, setConfirmModal }) {
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterClass, setFilterClass] = useState('all');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchRecords = async () => {
    if (!user || !filterDate) return;
    setLoading(true);
    try {
      const snap = await getDocs(getColRef('rollcall_records'));
      let data = [];
      snap.forEach(doc => {
        const rec = doc.data();
        if (rec.date === filterDate) {
          if (filterClass === 'all' || rec.classId === filterClass) data.push(rec);
        }
      });
      setRecords(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRecords();
  }, [filterDate, filterClass, user]);

  const handleDeleteRecord = async (id) => {
    try {
      await deleteDoc(getDocRef('rollcall_records', id));
      showToast("點名紀錄已刪除");
      fetchRecords();
    } catch (err) {
      showToast("刪除失敗", "error");
    }
  };

  const handleDeleteAllRecords = async () => {
    if (records.length === 0) return;
    try {
      const batch = writeBatch(db);
      records.forEach(rec => {
        batch.delete(getDocRef('rollcall_records', rec.id));
      });
      await batch.commit();
      showToast("畫面上的點名紀錄已全數刪除");
      fetchRecords();
    } catch (err) {
      showToast("刪除失敗", "error");
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b pb-4 print:hidden space-y-4 sm:space-y-0">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center">
          <ClipboardList className="text-indigo-600 w-6 h-6 mr-2" /> 點名紀錄查詢
        </h2>
        <div className="flex space-x-2">
          <button 
            onClick={() => setConfirmModal({
              show: true, type: 'all_records', name: filterDate,
              onConfirm: () => { handleDeleteAllRecords(); setConfirmModal({show:false}); }
            })} 
            disabled={records.length === 0 || loading}
            className="bg-red-600 hover:bg-red-700 text-white py-1.5 px-4 rounded flex items-center text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4 mr-1" /> 刪除顯示紀錄
          </button>
          <button onClick={() => window.print()} className="bg-green-600 hover:bg-green-700 text-white py-1.5 px-4 rounded flex items-center text-sm">
            <Printer className="w-4 h-4 mr-1" /> 列印報表
          </button>
        </div>
      </div>

      <div className="hidden print:block text-center mb-6">
        <h2 className="text-2xl font-bold">學習扶助點名紀錄表</h2>
        <p className="text-gray-600 mt-2">日期：{formatDate(filterDate)}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 print:hidden bg-gray-50 p-4 rounded-lg">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">查詢日期</label>
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{colorScheme: 'light'}} className="w-full border-gray-300 border rounded-md p-2 outline-none bg-white text-gray-900" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">查詢班級 (選填)</label>
          <select value={filterClass} onChange={e => setFilterClass(e.target.value)} className="w-full border-gray-300 border rounded-md p-2 outline-none bg-white text-gray-900">
            <option value="all">所有班級</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div></div>
      ) : records.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>此日期/班級尚無點名紀錄。</p>
        </div>
      ) : (
        <div className="space-y-6">
          {records.map(rec => {
            const total = rec.attendance.length;
            const present = rec.attendance.filter(a => a.status === 'present').length;
            const absentCount = total - present;
            const absentees = rec.attendance.filter(a => a.status !== 'present');

            return (
              <div key={rec.id} className="border border-gray-200 rounded-lg overflow-hidden shadow-sm page-break-inside-avoid">
                <div className="bg-gray-50 px-4 py-3 border-b flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-bold text-gray-800">{rec.className}</h3>
                    <p className="text-sm text-gray-600">授課教師：{rec.teacher}</p>
                  </div>
                  <div className="text-right flex items-center space-x-2">
                    <div>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mr-2">
                        應到: {total} | 實到: {present}
                      </span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${absentCount > 0 ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                        缺席: {absentCount}
                      </span>
                    </div>
                    <button 
                      onClick={() => setConfirmModal({
                        show: true, type: 'record', name: `${rec.className} 點名紀錄`,
                        onConfirm: () => { handleDeleteRecord(rec.id); setConfirmModal({show:false}); }
                      })} 
                      className="text-red-400 hover:text-red-600 p-1.5 print:hidden border border-transparent hover:bg-red-50 rounded transition-colors" 
                      title="刪除此紀錄"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="p-4 bg-white">
                  {rec.generalNote && (
                    <div className="mb-4 bg-yellow-50 border-l-4 border-yellow-400 p-3 text-sm">
                      <span className="font-bold text-yellow-800">課堂備註：</span> {rec.generalNote}
                    </div>
                  )}

                  {absentees.length > 0 && (
                    <>
                      <h4 className="font-medium text-red-700 mb-2 border-b pb-1 text-sm">缺席名單</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                        {absentees.map((a, idx) => {
                          const statusInfo = STATUS_OPTIONS.find(o => o.val === a.status);
                          return (
                            <div key={idx} className="bg-red-50 p-2 rounded border border-red-100 text-sm flex justify-between items-center">
                              <span><span className="font-medium">{a.studentName}</span> <span className="text-xs text-gray-500">({statusInfo?.label})</span></span>
                              {a.note && <span className="text-xs bg-white px-1 border rounded text-gray-600 truncate max-w-[80px]" title={a.note}>{a.note}</span>}
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}

                  <details className="print:hidden mt-4 border-t pt-2 group">
                    <summary className="text-sm text-indigo-600 cursor-pointer hover:text-indigo-800 font-medium list-none flex items-center">
                      <ChevronDown className="w-4 h-4 mr-1 transition-transform group-open:rotate-180" /> 展開完整名單明細
                    </summary>
                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 text-sm border">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">學生姓名</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">狀態</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">備註</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {rec.attendance.map((a, idx) => {
                            const statusInfo = STATUS_OPTIONS.find(o => o.val === a.status);
                            return (
                              <tr key={idx}>
                                <td className="px-3 py-2 font-medium">{a.studentName}</td>
                                <td className={`px-3 py-2 ${statusInfo?.val === 'present' ? 'text-green-600' : 'text-red-600 font-medium'}`}>{statusInfo?.label}</td>
                                <td className="px-3 py-2 text-gray-500 text-xs">{a.note || '-'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  );
}

function AdminSettings({ classes, students, user, refreshData, showToast, setConfirmModal }) {
  const [activeClassId, setActiveClassId] = useState('');
  
  const [classModal, setClassModal] = useState({ show: false, id: '', name: '', teacher: '' });
  const [studentModal, setStudentModal] = useState({ show: false, id: '', classId: '', name: '', originalClass: '', originalNumber: '', number: '' });
  const [importModal, setImportModal] = useState({ show: false, classId: '', file: null, parsedData: [] });
  const [globalImportModal, setGlobalImportModal] = useState({ show: false, file: null, parsedData: [], classesCount: 0, studentsCount: 0 });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeClass = classes.find(c => c.id === activeClassId);
  const activeStudents = students.filter(s => s.classId === activeClassId).sort((a, b) => (parseInt(a.number)||999) - (parseInt(b.number)||999));

  const handleSaveClass = async () => {
    if (!classModal.name || !classModal.teacher) return showToast("請填寫完整資訊", "warning");
    const classData = {
      id: classModal.id || `class_${generateId()}`,
      name: classModal.name.trim(),
      teacher: classModal.teacher.trim(),
      updatedAt: new Date().toISOString()
    };
    try {
      await setDoc(getDocRef('classes', classData.id), classData);
      showToast("班級儲存成功");
      setClassModal({ show: false, id: '', name: '', teacher: '' });
      refreshData();
    } catch (e) {
      showToast("儲存失敗", "error");
    }
  };

  const handleSaveStudent = async () => {
    if (!studentModal.name) return showToast("請填寫學生姓名", "warning");
    const stuData = {
      id: studentModal.id || `stu_${generateId()}`,
      classId: studentModal.classId,
      name: studentModal.name.trim(),
      originalClass: studentModal.originalClass.trim(),
      originalNumber: studentModal.originalNumber.trim(),
      number: parseInt(studentModal.number) || 999,
      updatedAt: new Date().toISOString()
    };
    try {
      await setDoc(getDocRef('students', stuData.id), stuData);
      showToast("學生儲存成功");
      setStudentModal({ show: false });
      refreshData();
    } catch (e) {
      showToast("儲存失敗", "error");
    }
  };

  const handleDeleteClass = async (id) => {
    try {
      await deleteDoc(getDocRef('classes', id));
      
      const batch = writeBatch(db);
      
      // 1. 刪除該班級的學生
      const stuToDelete = students.filter(s => s.classId === id);
      stuToDelete.forEach(s => batch.delete(getDocRef('students', s.id)));
      
      // 2. 刪除該班級對應的歷史點名紀錄
      const recordsSnap = await getDocs(getColRef('rollcall_records'));
      recordsSnap.forEach(docSnap => {
        if (docSnap.data().classId === id) {
          batch.delete(getDocRef('rollcall_records', docSnap.id));
        }
      });

      await batch.commit();
      
      if (activeClassId === id) setActiveClassId('');
      showToast("班級及其學生與歷史點名紀錄已刪除");
      refreshData();
    } catch (e) {
      showToast("刪除失敗", "error");
    }
  };

  const handleDeleteStudent = async (id) => {
    try {
      await deleteDoc(getDocRef('students', id));
      showToast("學生已刪除");
      refreshData();
    } catch (e) {
      showToast("刪除失敗", "error");
    }
  };

  const downloadCSVTemplate = () => {
    const csvContent = "\uFEFF姓名,原班級,原班級座號\n王小明,701,1\n陳小華,702,5";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }); 
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '學生匯入範例.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
      const parsed = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length >= 1 && cols[0].trim() !== '') {
          parsed.push({ name: cols[0].trim(), originalClass: cols[1]?.trim()||'', originalNumber: cols[2]?.trim()||'' });
        }
      }
      if (parsed.length > 0) {
        setImportModal(prev => ({...prev, parsedData: parsed, file: file}));
      } else {
        showToast("無法解析有效資料", "error");
      }
    };
    reader.readAsText(file);
  };

  const confirmBulkImport = async () => {
    if (!importModal.classId || importModal.parsedData.length === 0) return;
    try {
      const batch = writeBatch(db);
      let maxNum = activeStudents.reduce((max, s) => Math.max(max, parseInt(s.number) || 0), 0);
      
      importModal.parsedData.forEach(stu => {
        maxNum++;
        const sId = `stu_${generateId()}`;
        batch.set(getDocRef('students', sId), {
          id: sId, classId: importModal.classId, name: stu.name, originalClass: stu.originalClass, originalNumber: stu.originalNumber, number: maxNum, createdAt: new Date().toISOString()
        });
      });
      await batch.commit();
      showToast(`成功匯入 ${importModal.parsedData.length} 筆資料！`);
      setImportModal({show: false, classId: '', file: null, parsedData: []});
      refreshData();
    } catch (e) {
      console.error(e);
      showToast("匯入失敗: " + e.message, "error");
    }
  };

  const downloadGlobalCSVTemplate = () => {
    const csvContent = "\uFEFF扶助班級,授課教師,學生姓名,原班級,原班級座號\n英文7,楊育珽,王小明,701,1\n英文7,楊育珽,陳小華,702,5\n數學8,呂宜軒,林大顆,803,12";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }); 
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '全校學習扶助名單匯入範例.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleGlobalFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
      const parsed = [];
      const classesSet = new Set();
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length >= 3 && cols[0].trim() !== '' && cols[2].trim() !== '') {
          parsed.push({ 
            className: cols[0].trim(), 
            teacher: cols[1]?.trim() || '',
            studentName: cols[2].trim(),
            originalClass: cols[3]?.trim() || '', 
            originalNumber: cols[4]?.trim() || '' 
          });
          classesSet.add(cols[0].trim());
        }
      }
      if (parsed.length > 0) {
        setGlobalImportModal({show: true, file, parsedData: parsed, classesCount: classesSet.size, studentsCount: parsed.length});
      } else {
        showToast("無法解析有效資料，請確認格式", "error");
      }
    };
    reader.readAsText(file);
  };

  const confirmGlobalImport = async () => {
    if (globalImportModal.parsedData.length === 0) return;
    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      const classMap = {};
      const classMaxStuNum = {};
      
      classes.forEach(c => {
         classMap[c.name] = c.id;
         const stus = students.filter(s => s.classId === c.id);
         classMaxStuNum[c.id] = stus.reduce((max, s) => Math.max(max, parseInt(s.number) || 0), 0);
      });

      for (const row of globalImportModal.parsedData) {
        let classId = classMap[row.className];

        if (!classId) {
          classId = `class_${generateId()}`;
          classMap[row.className] = classId;
          classMaxStuNum[classId] = 0;
          batch.set(getDocRef('classes', classId), {
            id: classId,
            name: row.className,
            teacher: row.teacher,
            createdAt: new Date().toISOString()
          });
        }

        classMaxStuNum[classId]++;
        const stuId = `stu_${generateId()}`;
        batch.set(getDocRef('students', stuId), {
          id: stuId,
          classId: classId,
          name: row.studentName,
          originalClass: row.originalClass,
          originalNumber: row.originalNumber,
          number: classMaxStuNum[classId],
          createdAt: new Date().toISOString()
        });
      }

      await batch.commit();
      showToast(`成功匯入 ${globalImportModal.classesCount} 個班級，共 ${globalImportModal.studentsCount} 位學生！`);
      setGlobalImportModal({show: false, file: null, parsedData: [], classesCount: 0, studentsCount: 0});
      refreshData();
    } catch (err) {
      console.error(err);
      showToast("匯入失敗: " + err.message, "error"); 
    }
    setIsSubmitting(false);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 print:hidden">
      <div className="flex justify-between items-center mb-6 border-b pb-2">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center">
          <Settings className="text-indigo-600 w-6 h-6 mr-2" /> 名單與課程設定
        </h2>
        <button onClick={() => setGlobalImportModal({show:true, file:null, parsedData:[], classesCount: 0, studentsCount: 0})} className="bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded shadow-sm transition flex items-center text-sm font-medium">
          <Upload className="w-4 h-4 mr-2"/> 全校名單匯入
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 border-r-0 lg:border-r pr-0 lg:pr-6 border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">扶助班級列表</h3>
            <button onClick={() => setClassModal({show:true, id:'', name:'', teacher:''})} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium flex items-center">
              <Plus className="w-4 h-4 mr-1" /> 新增
            </button>
          </div>
          <ul className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
            {classes.map(cls => (
              <li key={cls.id} className={`flex justify-between items-center p-3 rounded-md cursor-pointer border transition-colors ${activeClassId === cls.id ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                <div className="flex-grow font-medium text-gray-800" onClick={() => setActiveClassId(cls.id)}>
                  {cls.name} <span className="text-xs text-gray-500 font-normal ml-1">({cls.teacher})</span>
                </div>
                <button 
                  onClick={() => setConfirmModal({show: true, type: 'class', id: cls.id, name: cls.name, onConfirm: () => { handleDeleteClass(cls.id); setConfirmModal({show:false}); }})}
                  className="text-red-400 hover:text-red-600 p-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-2">
          {!activeClassId ? (
            <div className="text-center py-16 text-gray-400">
              <p>請從左側選擇一個班級以管理其學生名單。</p>
            </div>
          ) : (
            <div>
              <div className="bg-indigo-50 rounded-lg p-4 mb-4 flex flex-col sm:flex-row justify-between sm:items-center space-y-3 sm:space-y-0">
                <div>
                  <h3 className="text-lg font-bold text-indigo-900">管理名單：{activeClass?.name}</h3>
                  <p className="text-sm text-indigo-700">授課教師：{activeClass?.teacher}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setClassModal({show:true, ...activeClass})} className="bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-100 py-1.5 px-3 rounded text-sm shadow-sm transition">修改課程資訊</button>
                  <button onClick={() => setImportModal({show:true, classId: activeClassId, file:null, parsedData:[]})} className="bg-green-600 hover:bg-green-700 text-white py-1.5 px-3 rounded text-sm shadow-sm transition flex items-center">
                    <Upload className="w-4 h-4 mr-1"/> 匯入此班級
                  </button>
                  <button onClick={() => setStudentModal({show:true, id:'', classId: activeClassId, name:'', originalClass:'', originalNumber:'', number: activeStudents.length+1})} className="bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 px-3 rounded text-sm shadow-sm transition flex items-center">
                    <Plus className="w-4 h-4 mr-1"/> 新增學生
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border rounded-lg border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">編號</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">姓名</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">原班級</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">原座號</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {activeStudents.length === 0 ? (
                      <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-500">目前沒有學生資料</td></tr>
                    ) : (
                      activeStudents.map(stu => (
                        <tr key={stu.id}>
                          <td className="px-4 py-3 text-sm text-gray-500">{stu.number || '-'}</td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{stu.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{stu.originalClass || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{stu.originalNumber || '-'}</td>
                          <td className="px-4 py-3 text-right text-sm font-medium space-x-3">
                            <button onClick={() => setStudentModal({show:true, ...stu})} className="text-indigo-600 hover:text-indigo-900"><Edit className="w-4 h-4 inline"/></button>
                            <button onClick={() => setConfirmModal({show:true, type:'student', id:stu.id, name:stu.name, onConfirm: () => {handleDeleteStudent(stu.id); setConfirmModal({show:false});}})} className="text-red-600 hover:text-red-900"><Trash2 className="w-4 h-4 inline"/></button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {}
      {classModal.show && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 px-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">{classModal.id ? '編輯班級' : '新增班級'}</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">班級名稱</label>
              <input type="text" value={classModal.name} onChange={e => setClassModal({...classModal, name: e.target.value})} style={{colorScheme: 'light'}} className="w-full border p-2 rounded outline-none focus:border-indigo-500 bg-white text-gray-900"/>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">授課教師</label>
              <input type="text" value={classModal.teacher} onChange={e => setClassModal({...classModal, teacher: e.target.value})} style={{colorScheme: 'light'}} className="w-full border p-2 rounded outline-none focus:border-indigo-500 bg-white text-gray-900"/>
            </div>
            <div className="flex justify-end space-x-3">
              <button onClick={() => setClassModal({show:false})} className="px-4 py-2 bg-gray-200 rounded text-gray-800">取消</button>
              <button onClick={handleSaveClass} className="px-4 py-2 bg-indigo-600 text-white rounded">儲存</button>
            </div>
          </div>
        </div>
      )}

      {studentModal.show && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 px-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">{studentModal.id ? '編輯學生' : '新增學生'}</h3>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
              <input type="text" value={studentModal.name} onChange={e => setStudentModal({...studentModal, name: e.target.value})} style={{colorScheme: 'light'}} className="w-full border p-2 rounded outline-none focus:border-indigo-500 bg-white text-gray-900"/>
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">原班級</label>
              <input type="text" value={studentModal.originalClass} onChange={e => setStudentModal({...studentModal, originalClass: e.target.value})} style={{colorScheme: 'light'}} className="w-full border p-2 rounded outline-none focus:border-indigo-500 bg-white text-gray-900"/>
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">原班級座號</label>
              <input type="text" value={studentModal.originalNumber} onChange={e => setStudentModal({...studentModal, originalNumber: e.target.value})} style={{colorScheme: 'light'}} className="w-full border p-2 rounded outline-none focus:border-indigo-500 bg-white text-gray-900"/>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">扶助班級內座號 (排序用)</label>
              <input type="number" value={studentModal.number} onChange={e => setStudentModal({...studentModal, number: e.target.value})} style={{colorScheme: 'light'}} className="w-full border p-2 rounded outline-none focus:border-indigo-500 bg-white text-gray-900"/>
            </div>
            <div className="flex justify-end space-x-3">
              <button onClick={() => setStudentModal({show:false})} className="px-4 py-2 bg-gray-200 rounded text-gray-800">取消</button>
              <button onClick={handleSaveStudent} className="px-4 py-2 bg-indigo-600 text-white rounded">儲存</button>
            </div>
          </div>
        </div>
      )}

      {}
      {importModal.show && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 px-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
            <h3 className="text-lg font-bold mb-4">批次匯入學生</h3>
            <div className="mb-4 text-sm text-gray-600 bg-blue-50 p-3 rounded border border-blue-100">
              <p className="mb-2"><Info className="inline w-4 h-4 text-blue-500 mr-1"/>請先下載範例檔案，依格式填寫後上傳 (請存為 CSV)。</p>
              <button onClick={downloadCSVTemplate} className="text-indigo-600 hover:underline font-medium flex items-center"><FileDown className="w-4 h-4 mr-1"/>下載範例檔案 (CSV)</button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">上傳 CSV 檔案</label>
              <input type="file" accept=".csv" onChange={handleFileUpload} style={{colorScheme: 'light'}} className="w-full border border-gray-300 rounded-md p-2 text-sm bg-white text-gray-900" />
            </div>
            {importModal.parsedData.length > 0 && (
              <div className="mb-4 text-sm text-green-600 bg-green-50 p-2 rounded border border-green-200 flex items-center">
                <CheckCircle className="w-4 h-4 mr-2"/> 成功解析 <strong>{importModal.parsedData.length}</strong> 筆學生資料。
              </div>
            )}
            <div className="flex justify-end space-x-3 mt-4">
              <button onClick={() => setImportModal({show:false, classId:'', file:null, parsedData:[]})} className="px-4 py-2 bg-gray-200 rounded text-gray-800">取消</button>
              <button onClick={confirmBulkImport} disabled={importModal.parsedData.length === 0} className="px-4 py-2 bg-indigo-600 text-white rounded disabled:bg-indigo-400">確認匯入</button>
            </div>
          </div>
        </div>
      )}

      {globalImportModal.show && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 px-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
            <h3 className="text-lg font-bold mb-4">全校名單批次匯入</h3>
            <div className="mb-4 text-sm text-gray-600 bg-blue-50 p-3 rounded border border-blue-100">
              <p className="mb-2"><Info className="inline w-4 h-4 text-blue-500 mr-1"/>請下載範例檔案，依格式填寫所有班級與學生資料後上傳 (請存為 CSV 格式)。<br/>系統會自動建立班級並匯入對應學生。</p>
              <button onClick={downloadGlobalCSVTemplate} className="text-indigo-600 hover:underline font-medium flex items-center"><FileDown className="w-4 h-4 mr-1"/>下載全校匯入範例 (CSV)</button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">上傳 CSV 檔案</label>
              <input type="file" accept=".csv" onChange={handleGlobalFileUpload} style={{colorScheme: 'light'}} className="w-full border border-gray-300 rounded-md p-2 text-sm bg-white text-gray-900" />
            </div>
            {globalImportModal.parsedData.length > 0 && (
              <div className="mb-4 text-sm text-green-600 bg-green-50 p-2 rounded border border-green-200 flex items-center">
                <CheckCircle className="w-4 h-4 mr-2"/> 成功解析 <strong>{globalImportModal.classesCount}</strong> 個班級，共 <strong>{globalImportModal.studentsCount}</strong> 筆學生資料。
              </div>
            )}
            <div className="flex justify-end space-x-3 mt-4">
              <button onClick={() => setGlobalImportModal({show:false, file:null, parsedData:[], classesCount: 0, studentsCount: 0})} className="px-4 py-2 bg-gray-200 text-gray-800 rounded">取消</button>
              <button onClick={confirmGlobalImport} disabled={globalImportModal.parsedData.length === 0 || isSubmitting} className="px-4 py-2 bg-indigo-600 text-white rounded disabled:bg-indigo-400 flex items-center">
                {isSubmitting ? '處理中...' : '確認匯入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}