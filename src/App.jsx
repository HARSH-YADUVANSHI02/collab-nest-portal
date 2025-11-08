import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  signInWithCustomToken,
  signInAnonymously,
  sendEmailVerification
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  collection,
  query,
  onSnapshot,
  serverTimestamp,
  setLogLevel
} from 'firebase/firestore';
// Storage imports are removed
import {
  Users,
  Search,
  Award,
  User,
  LogOut,
  LogIn,
  Edit,
  Save,
  X,
  Plus,
  Loader2,
  Menu,
  FileText,
  Bot,
  ThumbsUp,
  MessageSquare,
  Sparkles,
  Send,
  Briefcase, // For Projects
  Inbox, // For Inbox
  BrainCircuit, // For AI Matcher
 MessageCircle, // For Send Message
  Trash2 // 
} from 'lucide-react';

// --- Configuration ---
const UNIVERSITY_DOMAIN = '@iilm.edu';
const COURSE_OPTIONS = [
  'BBA',
  'MBA',
  'B.Tech (CSE)',
  'B.Tech (AI/ML)',
  'B.Design',
  'BA LLB',
  'BBA LLB',
  'BA (Psychology)',
  'Other'
];
const SEMESTER_OPTIONS = [
  '1st',
  '2nd',
  '3rd',
  '4th',
  '5th',
  '6th',
  '7th',
  '8th',
];

// --- Gemini API Configuration ---
let geminiApiKey;
try {
  geminiApiKey = import.meta.env.VITE_APP_GEMINI_API_KEY || "";
} catch (e) {
  console.error("Failed to read Gemini API key", e);
  geminiApiKey = "";
}

const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`;


// --- Firebase Initialization (using environment variables) ---
let firebaseConfig;
try {
  // This securely loads the config from your .env.local file (for local dev)
  // or from your Netlify/GitHub environment variables (for production)
  firebaseConfig = JSON.parse(import.meta.env.VITE_APP_FIREBASE_CONFIG);
} catch (e) {
  console.error("Failed to parse Firebase config. Make sure it's set in your .env.local file or Netlify/GitHub variables.", e);
  firebaseConfig = {}; // Fallback
}

// This is now safe, as 'appId' is part of your config, but we get it for the db path
const appId = firebaseConfig.appId || 'default-app-id'; 

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// Storage initialization removed
// Enable Firestore debugging
try {
  setLogLevel('Debug');
} catch (e) {
  console.error("Failed to set Firestore log level:", e);
}
// --- Gemini API Helper Function ---

/**
 * Calls the Gemini API with exponential backoff.
 * @param {object} payload - The payload to send to the Gemini API.
 * @param {number} maxRetries - Maximum number of retries.
 * @returns {Promise<string>} - The generated text from the model.
 */
const callGeminiApi = async (payload, maxRetries = 5) => {
  let attempt = 0;
  let delay = 1000; // Start with 1 second

  while (attempt < maxRetries) {
    try {
      const response = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return text;
        } else {
          console.error("Gemini API Error: No text in response", result);
          throw new Error("Invalid response from API. Check console for details.");
        }
      }

      // Handle non-OK responses
      if (response.status === 429 || response.status >= 500) {
        // Throttling or server error, wait and retry
        console.warn(`Gemini API Error: Status ${response.status}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
        attempt++;
      } else {
        // Other client-side error (e.g., 400 Bad Request)
        const errorResult = await response.json();
        console.error("Gemini API Error:", errorResult);
        throw new Error(`API request failed with status ${response.status}. Check console.`);
      }

    } catch (error) {
      console.error("Error calling Gemini API:", error);
      if (attempt >= maxRetries - 1) {
        throw error; // Throw error after last attempt
      }
      // Wait and retry for network errors
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
      attempt++;
    }
  }
  
  throw new Error("Gemini API call failed after all retries.");
};


// --- Helper Components ---

/**
 * A simple loading spinner component
 */
const LoadingSpinner = ({ size = 24 }) => (
  <div className="flex justify-center items-center p-4">
    <Loader2 size={size} className="animate-spin text-emerald-600" />
  </div>
);

/**
 * A modal component for notifications (replaces alert())
 */
const Modal = ({ title, message, isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 relative transition-all transform scale-100 opacity-100">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
        >
          <X size={20} />
        </button>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{message}</p>
        <button
          onClick={onClose}
          className="mt-6 w-full bg-emerald-600 text-white py-2 px-4 rounded-md hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
};

// --- Authentication Components ---

/**
 * Login Page Component
 */
const LoginPage = ({ setPage, showModal }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
   try {
  // --- REPLACE THIS WHOLE BLOCK ---
  const userCredential = await signInWithEmailAndPassword(auth, email, password);

  if (!userCredential.user.emailVerified) {
    // User's email is not verified
    await signOut(auth); // Log them back out
    showModal(
      "Email Not Verified",
      "Please check your inbox and click the verification link we sent you. If you don't see it, check your spam folder."
    );
    setIsLoading(false); // Stop loading
    return; // Stop the function
  }
  // If verified, onAuthStateChanged will see the user and log them in
  // --- END OF REPLACED BLOCK ---
} catch (error) {
      console.error("Login Error:", error);
      showModal('Login Failed', error.message.replace('Firebase: ', ''));
    }
    setIsLoading(false);
  };

  return (
    <div className="flex-grow flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-8 sm:p-10">
        <div className="flex justify-center items-center mb-6">
          <FileText className="h-10 w-10 text-emerald-600" />
          <span className="ml-2 text-3xl font-bold text-gray-900">CollabNest</span>
        </div>
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">
          Welcome Back
        </h2>
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700"
            >
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 transition[...]
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 transition[...]
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none fo[...]
          >
            {isLoading ? <Loader2 className="animate-spin" /> : 'Sign In'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-gray-600">
          Don't have an account?{' '}
          <button
            onClick={() => setPage({ name: 'signup' })}
            className="font-medium text-emerald-600 hover:text-emerald-500 transition-colors"
          >
            Sign Up
          </button>
        </p>
      </div>
    </div>
  );
};

/**
 * SignUp Page Component
 */
const SignUpPage = ({ setPage, showModal }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('student'); // 'student' or 'teacher'
  const [course, setCourse] = useState('');
  const [semester, setSemester] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Teacher fields
  const [designation, setDesignation] = useState('');
  const [department, setDepartment] = useState('');
  const [office, setOffice] = useState('');
  const [officeHours, setOfficeHours] = useState('');
  const [phone, setPhone] = useState('');
  const [subjects, setSubjects] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [education, setEducation] = useState('');
  const handleSignUp = async (e) => {
    e.preventDefault();

    /*if (!email.endsWith(UNIVERSITY_DOMAIN)) {
      showModal(
        'Invalid Email',
        `Sign-up is restricted to ${UNIVERSITY_DOMAIN} email addresses.`
      );
      return;
    }*/

    if (password.length < 6) {
      showModal(
        'Weak Password',
        'Password should be at least 6 characters long.'
      );
      return;
    }
        if (role === 'student' && (!course || !semester)) {
      showModal(
        'Incomplete Form',
        'Please select your course and semester.'
      );
      return;
    }

    setIsLoading(true);
    try {
      // 1. Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      // 2. Create user profile in Firestore
      const userRef = doc(db, `artifacts/${appId}/public/data/users`, user.uid);
     await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        name: name,
        role: role,
        bio: '',
        skills: [],
        linkedin: '',
        github: '',
        course: role === 'student' ? course : '',
        semester: role === 'student' ? semester : '',
        // teacher-specific fields
        designation: role === 'teacher' ? designation : '',
        department: role === 'teacher' ? department : '',
        office: role === 'teacher' ? office : '',
        officeHours: role === 'teacher' ? officeHours : '',
        phone: role === 'teacher' ? phone : '',
        subjects: role === 'teacher' ? subjects.split(',').map(s => s.trim()).filter(Boolean) : [],
        experienceYears: role === 'teacher' ? (experienceYears ? Number(experienceYears) : 0) : 0,
        education: role === 'teacher' ? education : '',
        createdAt: serverTimestamp(),
});
      await sendEmailVerification(user);
      await signOut(auth); // Log the user out immediately
      
      showModal(
        "Account Created!",
        "We've sent a verification link to your email. Please click the link to activate your account, then log in."
      );
      setPage({ name: 'login' }); // Redirect to login page
      
      // Auth state change will handle redirect
    } catch (error) {
      console.error("Sign Up Error:", error);
      // Check for the specific error
      if (error.code === 'auth/operation-not-allowed') {
        showModal(
          'Sign Up Failed',
          'Email/Password sign-up is not enabled in the Firebase project. The administrator must enable it in the Firebase Console (Authentication > Sign-in method).'
        );
      } else {
        showModal('Sign Up Failed', error.message.replace('Firebase: ', ''));
      }
    }
    setIsLoading(false);
  };

  return (
    <div className="flex-grow flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-8 sm:p-10">
        <div className="flex justify-center items-center mb-6">
          <FileText className="h-10 w-10 text-emerald-600" />
          <span className="ml-2 text-3xl font-bold text-gray-900">CollabNest</span>
        </div>
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">
          Create Your Account
        </h2>
        <form onSubmit={handleSignUp} className="space-y-6">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700"
            >
              Full Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 transition dura[...]
            />
          </div>
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700"
            >
            Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 transition dura[...]
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              Password (min. 6 characters)
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 transition dura[...]
            />
          </div>
          <div>
            <label
              htmlFor="role"
              className="block text-sm font-medium text-gray-700"
            >
              I am a...
            </label>
            <select
              id="role"
              name="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 transition duration-150"
            >
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
            </select>
          </div>
                     
          {/* --- ADD THIS BLOCK START --- */}
          {role === 'student' && (
            <> 
              <div>
                <label
                  htmlFor="course"
                  className="block text-sm font-medium text-gray-700"
                >
                  Course
                </label>
                <select
                  id="course"
                  name="course"
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 transition duration-150"
                >
                  <option value="" disabled>Select your course</option>
                  {COURSE_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label
                  htmlFor="semester"
                  className="block text-sm font-medium text-gray-700"
                >
                  Semester
                </label>
                <select
                  id="semester"
                  name="semester"
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 transition duration-150"
                >
                  <option value="" disabled>Select your semester</option>
                  {SEMESTER_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </>
          )}
          {/* --- ADD THIS BLOCK END --- */}

          {role === 'teacher' && (
            <>
              <div>
                <label htmlFor="designation" className="block text-sm font-medium text-gray-700">Designation</label>
                <input id="designation" name="designation" type="text" value={designation} onChange={(e)=>setDesignation(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500" />
              </div>
              <div>
                <label htmlFor="department" className="block text-sm font-medium text-gray-700">Department</label>
                <input id="department" name="department" type="text" value={department} onChange={(e)=>setDepartment(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">              
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Phone</label>
                  <input id="phone" name="phone" type="text" value={phone} onChange={(e)=>setPhone(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500" />
                </div>
                <div>
                  <label htmlFor="office" className="block text-sm font-medium text-gray-700">Office</label>
                  <input id="office" name="office" type="text" value={office} onChange={(e)=>setOffice(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500" />
                </div>
              </div>

              <div>
                <label htmlFor="officeHours" className="block text-sm font-medium text-gray-700">Office Hours</label>
                <input id="officeHours" name="officeHours" type="text" value={officeHours} onChange={(e)=>setOfficeHours(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500" />
              </div>

              <div>
                <label htmlFor="subjects" className="block text-sm font-medium text-gray-700">Subjects (comma-separated)</label>
                <input id="subjects" name="subjects" type="text" value={subjects} onChange={(e)=>setSubjects(e.target.value)} placeholder="e.g., Calculus, AI, Data Structures" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="experienceYears" className="block text-sm font-medium text-gray-700">Years of Experience</label>
                  <input id="experienceYears" name="experienceYears" type="number" min="0" value={experienceYears} onChange={(e)=>setExperienceYears(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500" />
                </div>
                <div>
                  <label htmlFor="education" className="block text-sm font-medium text-gray-700">Education</label>
                  <input id="education" name="education" type="text" value={education} onChange={(e)=>setEducation(e.target.value)} placeholder="e.g., PhD in Computer Science" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500" />
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:r[...]
          >
            {isLoading ? <Loader2 className="animate-spin" /> : 'Sign Up'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <button
            onClick={() => setPage({ name: 'login' })}
            className="font-medium text-emerald-600 hover:text-emerald-500 transition-colors"
          >
            Sign In
          </button>
        </p>
      </div>
    </div>
  );
};

/**
 * Dashboard Page (Achievements Feed)
 */
const DashboardPage = ({ userId, user, showModal }) => {
  const [achievements, setAchievements] = useState([]);
  const [newAchievement, setNewAchievement] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [authorName, setAuthorName] = useState('...');

  // Fetch current user's name for posting
  useEffect(() => {
    if (userId) {
      const fetchUserName = async () => {
        const userRef = doc(db, `artifacts/${appId}/public/data/users`, userId);
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
          setAuthorName(docSnap.data().name);
        }
      };
      fetchUserName();
    }
  }, [userId]);

  // Listen for new achievements
  useEffect(() => {
    setIsLoading(true);
    const achievementsCol = collection(
      db,
      `artifacts/${appId}/public/data/achievements`
    );
    const q = query(achievementsCol);

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const docs = [];
        querySnapshot.forEach((doc) => {
          docs.push({ id: doc.id, ...doc.data() });
        });

        // Sort in memory (newest first)
        const sortedDocs = docs.sort((a, b) => {
          const timeA = a.createdAt?.toDate() || 0;
          const timeB = b.createdAt?.toDate() || 0;
          return timeB - timeA;
        });

        setAchievements(sortedDocs);
        setIsLoading(false);
      },
      (error) => {
        console.error("Error fetching achievements:", error);
        showModal("Error", "Could not load achievements feed.");
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [showModal]);

  const handlePostAchievement = async (e) => {
    e.preventDefault();
    if (newAchievement.trim() === '') {
        showModal("Empty Post", "Please write something to post.");
        return;
    }

    setIsPosting(true);

    try {
      const achievementsCol = collection(
        db,
        `artifacts/${appId}/public/data/achievements`
      );
      await addDoc(achievementsCol, {
        content: newAchievement,
        imageUrl: '', // Empty as feature is removed
        authorId: userId,
        authorName: authorName,
        createdAt: serverTimestamp(),
        likes: [], 
      });
      setNewAchievement('');
    } catch (error) {
      console.error("Error posting achievement:", error);
       showModal("Error", "Could not post your achievement. Please try again.");
    }
    setIsPosting(false);
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      <h2 className="text-3xl font-bold text-gray-900 mb-6">
        Achievement Feed
      </h2>

      {/* Post Form */}
      <form
        onSubmit={handlePostAchievement}
        className="bg-white p-6 rounded-xl shadow-lg mb-8"
      >
        <textarea
          value={newAchievement}
          onChange={(e) => setNewAchievement(e.target.value)}
          placeholder={`What have you achieved today, ${authorName.split(' ')[0]}?`}
          className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
          rows="3"
        ></textarea>
        
        <div className="flex justify-end items-center mt-4">
          <button
            type="submit"
            disabled={isPosting}
            className="flex items-center justify-center bg-emerald-600 text-white px-5 py-2 rounded-md hover:bg-emerald-700 disabled:bg-emerald-300 shadow-md hover:shadow-lg transition-all"
          >
            {isPosting ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Plus size={18} className="mr-2" />
            )}
            Post
          </button>
        </div>
      </form>

      {/* Feed */}
      <div className="space-y-6">
        {isLoading ? (
          <LoadingSpinner size={32} />
        ) : achievements.length === 0 ? (
          <p className="text-center text-gray-500">No achievements yet. Be the first to post!</p>
        ) : (
          achievements.map((post) => {
            const currentLikes = post.likes || [];
            const hasLiked = currentLikes.includes(userId);

            return (
              <div key={post.id} className="bg-white p-5 rounded-xl shadow-lg relative">
                {/* console.log removed */}
                {post.authorId === userId && (
                  <button
                    onClick={() => handleDeletePost(post.id)}
                    className="absolute top-3 right-3 text-gray-400 hover:text-red-500 transition-colors z-10"
                    title="Delete post"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                <div className="flex items-center mb-3">
                  <div className="flex-shrink-0 bg-emerald-100 rounded-full h-10 w-10 flex items-center justify-center">
                    <User size={20} className="text-emerald-600" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-semibold text-gray-900">
                      {post.authorName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {timeAgo(post.createdAt)}
                    </p>
                  </div>
                </div>
                
                {post.content && (
                  <p className="text-gray-800 whitespace-pre-wrap">{post.content}</p>
                )}
                
                {/* --- Like and Comment Actions --- */}
                <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-100">
                  <div className="flex space-x-5">
                    {/* Like Button */}
                    <button 
                      onClick={() => handleLikePost(post.id, currentLikes)} 
                      className="flex items-center space-x-1 text-gray-500 hover:text-emerald-600 transition-colors group"
                    >
                      <ThumbsUp 
                        size={18} 
                        className={`group-hover:text-emerald-600 ${hasLiked ? 'text-emerald-600 fill-emerald-600' : ''}`}
                      />
                      <span className={`text-sm group-hover:text-emerald-6D0 ${hasLiked ? 'text-emerald-600' : ''}`}>  
                        {currentLikes.length} {currentLikes.length === 1 ? 'Like' : 'Likes'}
                      </span>
                    </button>
                    {/* Comment Button */}
                    <button 
                      onClick={() => setExpandedCommentPostId(post.id === expandedCommentPostId ? null : post.id)} 
                      className="flex items-center space-x-1 text-gray-500 hover:text-emerald-600 transition-colors group"
                    >
                      <MessageSquare 
                        size={18} 
                        className={`group-hover:text-emerald-600 ${expandedCommentPostId === post.id ? 'text-emerald-600' : ''}`}
                      />
                      <span className={`text-sm group-hover:text-emerald-600 ${expandedCommentPostId === post.id ? 'text-emerald-600' : ''}`}>  
                        Comment
                      </span>
                    </button>
                  </div>
                </div>
                {/* --- END: Like and Comment Actions --- */}

                {/* --- Expanded Comment Section --- */}
                {expandedCommentPostId === post.id && (
                  <CommentSection 
                    postId={post.id} 
                    userId={userId} 
                    authorName={authorName} 
                    showModal={showModal} 
                  />
                )}
                {/* --- END: Expanded Comment Section --- */}
              </div>
            )
          })
        )}
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [page, setPage] = useState({ name: 'login' });
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '' });

  const showModal = (title, message) => {
    setModal({ isOpen: true, title, message });
  };
  const closeModal = () => {
    setModal({ isOpen: false, title: '', message: '' });
  };

  // Handle Firebase Auth
  useEffect(() => {
    const authAndSignIn = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          console.log("Signing in with custom token...");
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          console.log("Signing in anonymously...");
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Firebase initial sign-in error:", error);
      }
    };
    
    ...
    
    return () => unsubscribe();
  }, []);
}