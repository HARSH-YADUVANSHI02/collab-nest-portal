import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  signInWithCustomToken,
  signInAnonymously
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  addDoc,
  getDocs,
  updateDoc,
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
  MessageCircle // For Send Message
} from 'lucide-react';

// --- Configuration ---
const UNIVERSITY_DOMAIN = '@iilm.edu';

// --- Gemini API Configuration ---
const GEMINI_API_KEY = ""; // Leave as ""
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;


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
      await signInWithEmailAndPassword(auth, email, password);
      // Auth state change will handle redirecting to dashboard
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
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 transition duration-150"
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
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 transition duration-150"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:bg-emerald-300 transition-colors duration-300"
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
  const [isLoading, setIsLoading] = useState(false);

  const handleSignUp = async (e) => {
    e.preventDefault();

    if (!email.endsWith(UNIVERSITY_DOMAIN)) {
      showModal(
        'Invalid Email',
        `Sign-up is restricted to ${UNIVERSITY_DOMAIN} email addresses.`
      );
      return;
    }

    if (password.length < 6) {
      showModal(
        'Weak Password',
        'Password should be at least 6 characters long.'
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
        createdAt: serverTimestamp(),
      });

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
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 transition duration-150"
            />
          </div>
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700"
            >
              University Email ({UNIVERSITY_DOMAIN})
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 transition duration-150"
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
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 transition duration-150"
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
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:bg-emerald-300 transition-colors duration-300"
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

// --- Core App Components ---

/**
 * Navbar Component
 */
const Navbar = ({ user, setPage, handleLogout }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  
  // Check for new messages
  useEffect(() => {
    if (user) {
      const messagesCol = collection(db, `artifacts/${appId}/public/data/users`, user.uid, 'messages');
      const q = query(messagesCol); // Create the query
      
      // Attach the listener to the query
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const hasUnread = snapshot.docs.some(doc => !doc.data().isRead);
        setHasNewMessages(hasUnread);
      }, (error) => {
        console.error("Error checking for new messages:", error);
      });

      // Return the unsubscribe function for cleanup
      return () => unsubscribe();
    }
  }, [user]);


  const NavLink = ({ pageName, icon: Icon, children, hasBadge = false }) => (
    <button
      onClick={() => {
        setPage({ name: pageName, props: {} });
        setIsMobileMenuOpen(false);
      }}
      className="relative flex items-center space-x-2 text-gray-600 hover:text-emerald-600 px-3 py-2 rounded-md text-sm font-medium transition-colors"
    >
      <Icon size={18} />
      <span>{children}</span>
      {hasBadge && (
        <span className="absolute top-1 right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
        </span>
      )}
    </button>
  );

  const AuthButton = ({ isMobile = false }) => {
    if (user) {
      return (
        <div className={`flex items-center ${isMobile ? 'flex-col space-y-2' : 'space-x-4'}`}>
          <button
            onClick={() => {
              setPage({ name: 'profile', props: { profileId: user.uid } });
              setIsMobileMenuOpen(false);
            }}
            className="flex items-center space-x-2 text-gray-600 hover:text-emerald-600 px-3 py-2 rounded-md text-sm font-medium transition-colors"
          >
            <User size={18} />
            <span>My Profile</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center space-x-2 bg-emerald-600 text-white hover:bg-emerald-700 px-3 py-2 rounded-md text-sm font-medium transition-colors"
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      );
    }
    return (
      <div className={`flex items-center ${isMobile ? 'flex-col space-y-2' : 'space-x-2'}`}>
        <button
          onClick={() => {
            setPage({ name: 'login' });
            setIsMobileMenuOpen(false);
          }}
          className="flex items-center space-x-2 text-gray-600 hover:text-emerald-600 px-3 py-2 rounded-md text-sm font-medium transition-colors"
        >
          <LogIn size={18} />
          <span>Login</span>
        </button>
        <button
          onClick={() => {
            setPage({ name: 'signup' });
            setIsMobileMenuOpen(false);
          }}
          className="flex items-center space-x-2 bg-emerald-600 text-white hover:bg-emerald-700 px-3 py-2 rounded-md text-sm font-medium transition-colors"
        >
          <User size={18} />
          <span>Sign Up</span>
        </button>
      </div>
    );
  };

  return (
    <nav className="bg-white/95 backdrop-blur-sm shadow-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex-shrink-0 flex items-center">
            <FileText className="h-8 w-8 text-emerald-600" />
            <span className="ml-2 text-xl font-bold text-emerald-600">
              CollabNest
            </span>
          </div>

          {/* Desktop Nav */}
          <div className="hidden sm:flex sm:items-center sm:space-x-4">
            {user && (
              <>
                <NavLink pageName="dashboard" icon={Award}>
                  Dashboard
                </NavLink>
                <NavLink pageName="projects" icon={Briefcase}>
                  Projects
                </NavLink>
                <NavLink pageName="search" icon={Search}>
                  Search
                </NavLink>
                <NavLink pageName="ai_matcher" icon={BrainCircuit}>
                  AI Matcher
                </NavLink>
                <NavLink pageName="inbox" icon={Inbox} hasBadge={hasNewMessages}>
                  Inbox
                </NavLink>
                <NavLink pageName="ai_assistant" icon={Bot}>
                  AI Assistant
                </NavLink>
              </>
            )}
          </div>
          <div className="hidden sm:flex sm:items-center">
             <AuthButton />
          </div>

          {/* Mobile Menu Button */}
          <div className="sm:hidden flex items-center">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-gray-600 hover:text-gray-900 focus:outline-none"
            >
              <Menu size={24} />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="sm:hidden bg-white shadow-lg absolute top-16 left-0 right-0 z-30 p-4 space-y-2">
          {user && (
            <>
              <NavLink pageName="dashboard" icon={Award}>
                Dashboard
              </NavLink>
              <NavLink pageName="projects" icon={Briefcase}>
                Projects
              </NavLink>
              <NavLink pageName="search" icon={Search}>
                Search
              </NavLink>
               <NavLink pageName="ai_matcher" icon={BrainCircuit}>
                AI Matcher
              </NavLink>
              <NavLink pageName="inbox" icon={Inbox} hasBadge={hasNewMessages}>
                Inbox
              </NavLink>
              <NavLink pageName="ai_assistant" icon={Bot}>
                AI Assistant
              </NavLink>
            </>
          )}
          <AuthButton isMobile={true} />
        </div>
      )}
    </nav>
  );
};

/**
 * Comment Section Component
 */
const CommentSection = ({ postId, userId, authorName, showModal }) => {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [isLoadingComments, setIsLoadingComments] = useState(true);

  // Helper to format time
  const timeAgo = (date) => {
    if (!date) return 'just now';
    const seconds = Math.floor((new Date() - date.toDate()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m";
    return "just now";
  };

  // Listen for comments on this post
  useEffect(() => {
    setIsLoadingComments(true);
    const commentsColRef = collection(
      db,
      `artifacts/${appId}/public/data/achievements`,
      postId,
      'comments'
    );
    // Note: No orderBy, as requested. We will sort in memory.
    const q = query(commentsColRef);

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const commentList = [];
        querySnapshot.forEach((doc) => {
          commentList.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort comments by creation time (oldest first)
        commentList.sort((a, b) => {
          const timeA = a.createdAt?.toDate() || 0;
          const timeB = b.createdAt?.toDate() || 0;
          return timeA - timeB;
        });

        setComments(commentList);
        setIsLoadingComments(false);
      },
      (error) => {
        console.error("Error fetching comments:", error);
        showModal("Error", "Could not load comments.");
        setIsLoadingComments(false);
      }
    );

    return () => unsubscribe();
  }, [postId, showModal]);

  // Handle posting a new comment
  const handlePostComment = async (e) => {
    e.preventDefault();
    if (newComment.trim() === '') return;

    setIsPostingComment(true);
    try {
      const commentsColRef = collection(
        db,
        `artifacts/${appId}/public/data/achievements`,
        postId,
        'comments'
      );
      await addDoc(commentsColRef, {
        text: newComment,
        authorId: userId,
        authorName: authorName,
        createdAt: serverTimestamp(),
      });
      setNewComment('');
    } catch (error) {
      console.error("Error posting comment:", error);
      showModal("Error", "Could not post your comment.");
    }
    setIsPostingComment(false);
  };

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      {/* New Comment Form */}
      <form onSubmit={handlePostComment} className="flex space-x-2 mb-4">
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Write a comment..."
          className="flex-grow px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <button
          type="submit"
          disabled={isPostingComment}
          className="flex-shrink-0 bg-emerald-600 text-white px-3 py-2 rounded-md text-sm hover:bg-emerald-700 disabled:bg-emerald-300 transition-colors"
        >
          {isPostingComment ? <Loader2 size={18} className="animate-spin" /> : 'Post'}
        </button>
      </form>

      {/* Comment List */}
      <div className="space-y-3">
        {isLoadingComments && <LoadingSpinner size={20} />}
        {!isLoadingComments && comments.length === 0 && (
          <p className="text-xs text-gray-500 text-center">No comments yet.</p>
        )}
        {comments.map((comment) => (
          <div key={comment.id} className="flex items-start space-x-2">
            <div className="flex-shrink-0 bg-gray-100 rounded-full h-8 w-8 flex items-center justify-center">
              <User size={16} className="text-gray-500" />
            </div>
            <div className="flex-grow bg-gray-50 p-3 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800">
                  {comment.authorName}
                </span>
                <span className="text-xs text-gray-400">
                  {timeAgo(comment.createdAt)}
                </span>
              </div>
              <p className="text-sm text-gray-700 mt-1">{comment.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};


/**
 * AI Assistant Page
 */
const AIAssistantPage = ({ showModal }) => {
  const [chatHistory, setChatHistory] = useState([
    {
      role: "model",
      parts: [{ text: "Hello! I'm CollabBot. How can I help you with your projects or collaborations today?" }]
    }
  ]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = React.useRef(null);

  // System instruction for the chatbot
  const systemInstruction = {
    role: "system",
    parts: [{ text: "You are 'CollabBot,' a helpful AI assistant for the CollabNest college portal. Your goal is to help students connect, find collaborators, and get tips on their projects. Be friendly, encouraging, and concise. Your name is CollabBot. If users need administrative help or support, they can contact collabnest.iilm@gmail.com." }]
  };

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (newMessage.trim() === '' || isLoading) return;

    const userMessage = {
      role: "user",
      parts: [{ text: newMessage }]
    };
    
    // Add user message to chat
    setChatHistory(prevHistory => [...prevHistory, userMessage]);
    setNewMessage('');
    setIsLoading(true);

    try {
      // Construct the payload for Gemini
      const payload = {
        contents: [...chatHistory, userMessage],
        systemInstruction: systemInstruction
      };
      
      const responseText = await callGeminiApi(payload);
      
      const modelMessage = {
        role: "model",
        parts: [{ text: responseText }]
      };
      
      // Add model response to chat
      setChatHistory(prevHistory => [...prevHistory, modelMessage]);

    } catch (error) {
      console.error("Gemini chat error:", error);
      showModal("AI Error", "Sorry, I couldn't get a response from the assistant. Please try again.\n\n" + error.message);
      
      // Remove the user's message if the call failed
      setChatHistory(prevHistory => prevHistory.slice(0, prevHistory.length - 1));
    }
    setIsLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col" style={{ height: 'calc(100vh - 8rem)' }}>
      <h2 className="text-3xl font-bold text-gray-900 mb-6">
        AI Assistant
      </h2>
      
      {/* Chat Messages */}
      <div className="flex-grow bg-white p-6 rounded-xl shadow-lg mb-6 overflow-y-auto">
        <div className="space-y-4">
          {chatHistory.map((message, index) => (
            <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex items-start space-x-2 max-w-xs lg:max-w-md ${message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                 <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${message.role === 'user' ? 'bg-emerald-600' : 'bg-gray-200'}`}>
                  {message.role === 'user' ? (
                    <User size={16} className="text-white" />
                  ) : (
                    <Bot size={16} className="text-gray-600" />
                  )}
                 </div>
                 <div className={`px-4 py-2 rounded-lg ${message.role === 'user' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                   <p className="whitespace-pre-wrap">{message.parts[0].text}</p>
                 </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex items-start space-x-2">
                 <div className="flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center bg-gray-200">
                    <Bot size={16} className="text-gray-600" />
                 </div>
                 <div className="px-4 py-2 rounded-lg bg-gray-100 text-gray-800">
                   <Loader2 size={16} className="animate-spin" />
                 </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Chat Input Form */}
      <form onSubmit={handleSendMessage} className="flex space-x-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Ask CollabBot anything..."
          className="flex-grow px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="flex-shrink-0 bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 flex items-center justify-center transition-colors disabled:bg-emerald-300"
        >
          {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </form>
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
  const [expandedCommentPostId, setExpandedCommentPostId] = useState(null);

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
        authorEmail: user.email,
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

  // Handle Liking/Unliking a post
  const handleLikePost = async (postId, currentLikes) => {
    if (!userId) {
      showModal("Error", "You must be logged in to like a post.");
      return;
    }
    const postRef = doc(db, `artifacts/${appId}/public/data/achievements`, postId);
    const hasLiked = currentLikes.includes(userId);
    let newLikes;

    if (hasLiked) {
      newLikes = currentLikes.filter(uid => uid !== userId);
    } else {
      newLikes = [...currentLikes, userId];
    }

    try {
      await updateDoc(postRef, { likes: newLikes });
    } catch (error) {
      console.error("Error liking post:", error);
      showModal("Error", "Could not update like.");
    }
  };


  const timeAgo = (date) => {
    if (!date) return 'just now';
    const seconds = Math.floor((new Date() - date.toDate()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return "just now";
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
              <div key={post.id} className="bg-white p-5 rounded-xl shadow-lg">
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

/**
 * Search Page Component
 */
const SearchPage = ({ setPage }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Fetch all users on component mount to search locally
  useEffect(() => {
    const fetchAllUsers = async () => {
      setIsLoading(true);
      try {
        const usersCol = collection(
          db,
          `artifacts/${appId}/public/data/users`
        );
        const userSnapshot = await getDocs(usersCol);
        const userList = userSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setAllUsers(userList);
      } catch (error) {
        console.error("Error fetching all users:", error);
        // showModal is not passed, log to console
      }
      setIsLoading(false);
    };
    fetchAllUsers();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchTerm.trim() === '') {
      setResults([]);
      setHasSearched(true);
      return;
    }

    const lowerCaseSearch = searchTerm.toLowerCase();
    const filtered = allUsers.filter((user) => {
      const nameMatch = user.name.toLowerCase().includes(lowerCaseSearch);
      const skillMatch = user.skills.some((skill) =>
        skill.toLowerCase().includes(lowerCaseSearch)
      );
      return nameMatch || skillMatch;
    });

    setResults(filtered);
    setHasSearched(true);
  };

  const UserCard = ({ user }) => (
    <div className="bg-white p-5 rounded-xl shadow-lg flex items-start space-x-4 transition-shadow duration-300 hover:shadow-xl">
       <div className="flex-shrink-0 bg-gray-200 rounded-full h-12 w-12 flex items-center justify-center">
         <User size={24} className="text-gray-600" />
       </div>
       <div className="flex-grow">
          <h4 className="text-lg font-semibold text-gray-900">{user.name}</h4>
          <p className="text-sm text-gray-600 capitalize">{user.role}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {user.skills.slice(0, 5).map((skill, index) => (
              <span key={index} className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-xs font-medium rounded-full">
                {skill}
              </span>
            ))}
            {user.skills.length > 5 && (
               <span className="px-2 py-0.5 bg-gray-100 text-gray-800 text-xs font-medium rounded-full">
                +{user.skills.length - 5} more
              </span>
            )}
          </div>
       </div>
       <div className="flex-shrink-0">
         <button
            onClick={() => setPage({ name: 'profile', props: { profileId: user.id } })}
            className="px-3 py-1 bg-emerald-50 text-emerald-700 text-sm rounded-md hover:bg-emerald-100 transition-colors"
          >
            View Profile
          </button>
       </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      <h2 className="text-3xl font-bold text-gray-900 mb-6">
        Find Collaborators
      </h2>
      <form onSubmit={handleSearch} className="flex space-x-2 mb-8">
        <input
          type="search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by name or skill (e.g., 'Python', 'Jane Doe')"
          className="flex-grow px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="submit"
          className="flex-shrink-0 bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 flex items-center justify-center transition-colors"
        >
          <Search size={18} />
        </button>
      </form>

      {/* Results */}
      <div className="space-y-4">
        {isLoading && <LoadingSpinner size={32} />}
        {!isLoading && hasSearched && results.length === 0 && (
          <p className="text-center text-gray-500">
            No users found matching your search.
          </p>
        )}
        {results.map((user) => (
          <UserCard key={user.id} user={user} />
        ))}
      </div>
    </div>
  );
};

// --- NEW FEATURE: Send Message Modal ---
const SendMessageModal = ({ recipientId, recipientName, currentUserId, authorName, showModal, onClose }) => {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (message.trim() === '') return;

    setIsSending(true);
    try {
      // Create a reference to the RECIPIENT'S message inbox
      const messageCol = collection(db, `artifacts/${appId}/public/data/users`, recipientId, 'messages');
      
      await addDoc(messageCol, {
        text: message,
        fromId: currentUserId,
        fromName: authorName,
        sentAt: serverTimestamp(),
        isRead: false,
      });

      showModal("Message Sent!", `Your message to ${recipientName} has been sent.`);
      onClose();
    } catch (error) {
      console.error("Error sending message:", error);
      showModal("Error", "Could not send your message. Please try again.");
    }
    setIsSending(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
        >
          <X size={20} />
        </button>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Send Message to {recipientName}
        </h3>
        <form onSubmit={handleSendMessage}>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your message here..."
            className="w-full p-3 h-32 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
            rows="4"
          ></textarea>
          <button
            type="submit"
            disabled={isSending}
            className="mt-4 w-full flex items-center justify-center bg-emerald-600 text-white px-5 py-2 rounded-md hover:bg-emerald-700 disabled:bg-emerald-300 shadow-md hover:shadow-lg transition-all"
          >
            {isSending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Send size={18} className="mr-2" />
            )}
            Send
          </button>
        </form>
      </div>
    </div>
  );
};

// --- NEW FEATURE: Inbox Page ---
const InboxPage = ({ userId, showModal, setPage }) => {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Helper to format time
  const timeAgo = (date) => {
    if (!date) return 'just now';
    const seconds = Math.floor((new Date() - date.toDate()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return "just now";
  };

  // Listen for new messages
  useEffect(() => {
    if (!userId) return;
    
    setIsLoading(true);
    const messagesCol = collection(db, `artifacts/${appId}/public/data/users`, userId, 'messages');
    const q = query(messagesCol);

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const msgs = [];
      querySnapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() });
      });
      // Sort in memory (newest first)
      msgs.sort((a, b) => {
        const timeA = a.sentAt?.toDate() || 0;
        const timeB = b.sentAt?.toDate() || 0;
        return timeB - timeA;
      });
      setMessages(msgs);
      setIsLoading(false);
      
      // Mark messages as read
      markMessagesAsRead(msgs.filter(m => !m.isRead));
    }, (error) => {
      console.error("Error fetching messages:", error);
      showModal("Error", "Could not load your inbox.");
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [userId, showModal]);

  // Mark messages as read when they are loaded
  const markMessagesAsRead = async (unreadMessages) => {
    if (unreadMessages.length === 0) return;
    
    try {
      for (const msg of unreadMessages) {
        const msgRef = doc(db, `artifacts/${appId}/public/data/users`, userId, 'messages', msg.id);
        await updateDoc(msgRef, { isRead: true });
      }
    } catch (error) {
      console.error("Error marking messages as read:", error);
    }
  };


  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      <h2 className="text-3xl font-bold text-gray-900 mb-6">
        Inbox
      </h2>
      <div className="space-y-4">
        {isLoading && <LoadingSpinner size={32} />}
        {!isLoading && messages.length === 0 && (
          <p className="text-center text-gray-500">You have no messages.</p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`bg-white p-5 rounded-xl shadow-lg border-l-4 ${msg.isRead ? 'border-transparent' : 'border-emerald-500'}`}>
            <div className="flex justify-between items-center mb-2">
              <button 
                onClick={() => setPage({ name: 'profile', props: { profileId: msg.fromId } })}
                className="flex items-center space-x-2 group"
              >
                <div className="flex-shrink-0 bg-gray-100 rounded-full h-8 w-8 flex items-center justify-center">
                  <User size={16} className="text-gray-500" />
                </div>
                <span className="text-sm font-semibold text-gray-900 group-hover:text-emerald-600 group-hover:underline">
                  {msg.fromName}
                </span>
              </button>
              <span className="text-xs text-gray-400">{timeAgo(msg.sentAt)}</span>
            </div>
            <p className="text-gray-700 whitespace-pre-wrap ml-10">
              {msg.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};


// --- NEW FEATURE: AI Project Matcher Page ---
const AIMatcherPage = ({ userId, showModal, setPage }) => {
  const [projectDesc, setProjectDesc] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [matches, setMatches] = useState([]);
  
  const handleFindMatches = async (e) => {
    e.preventDefault();
    if (projectDesc.trim() === '') {
      showModal("Error", "Please describe your project first.");
      return;
    }
    
    setIsLoading(true);
    setMatches([]); // Clear previous matches
    
    try {
      // 1. Fetch all user profiles
      const usersCol = collection(db, `artifacts/${appId}/public/data/users`);
      const userSnapshot = await getDocs(usersCol);
      
      const allUsers = userSnapshot.docs
        .map(doc => doc.data())
        .filter(user => user.uid !== userId); // Filter out the current user
        
      if (allUsers.length === 0) {
        showModal("No Users", "There are no other users in the directory to match with.");
        setIsLoading(false);
        return;
      }
      
      // 2. Prepare user data for the AI
      const userProfilesSummary = allUsers.map(user => {
        return `User ID: ${user.uid}\nName: ${user.name}\nRole: ${user.role}\nBio: ${user.bio || 'N/A'}\nSkills: ${(user.skills || []).join(', ')}\n`;
      }).join("\n---\n");

      // 3. Call Gemini API
      const systemPrompt = "You are an AI assistant helping a student find project collaborators from a university directory. Your task is to analyze a project description and a list of user profiles. Return a JSON array of the top 3-5 best matches. For each match, provide their `userId`, a brief `reason` (1-2 sentences) why they are a good match, and their `name`. Do not match the user with themselves. If no good matches are found, return an empty array.";
      const userPrompt = `Here is my project description:\n"${projectDesc}"\n\nHere is the list of available users:\n${userProfilesSummary}\n\nReturn the JSON array of top matches.`;

      const payload = {
        contents: [{ parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        // --- NEW: Request JSON output ---
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                "userId": { "type": "STRING" },
                "name": { "type": "STRING" },
                "reason": { "type": "STRING" }
              }
            }
          }
        }
      };

      const responseText = await callGeminiApi(payload);
      const parsedMatches = JSON.parse(responseText);

      setMatches(parsedMatches);

    } catch (error) {
      console.error("Error in AI Matcher:", error);
      showModal("AI Error", "Could not find matches. Please try again.\n" + error.message);
    }
    setIsLoading(false);
  };
  
  const UserMatchCard = ({ match }) => (
    <div className="bg-white p-5 rounded-xl shadow-lg flex items-start space-x-4">
       <div className="flex-shrink-0 bg-emerald-100 rounded-full h-12 w-12 flex items-center justify-center">
         <User size={24} className="text-emerald-700" />
       </div>
       <div className="flex-grow">
          <h4 className="text-lg font-semibold text-gray-900">{match.name}</h4>
          <p className="text-sm text-gray-600 italic">"{match.reason}"</p>
       </div>
       <div className="flex-shrink-0">
         <button
            onClick={() => setPage({ name: 'profile', props: { profileId: match.userId } })}
            className="px-3 py-1 bg-emerald-50 text-emerald-700 text-sm rounded-md hover:bg-emerald-100 transition-colors"
          >
            View Profile
          </button>
       </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      <h2 className="text-3xl font-bold text-gray-900 mb-6">
        AI Project Matcher
      </h2>
      <form
        onSubmit={handleFindMatches}
        className="bg-white p-6 rounded-xl shadow-lg mb-8"
      >
        <label htmlFor="projectDesc" className="block text-sm font-medium text-gray-700 mb-2">
          Describe your project to find the best collaborators:
        </label>
        <textarea
          id="projectDesc"
          value={projectDesc}
          onChange={(e) => setProjectDesc(e.target.value)}
          placeholder="e.g., 'I'm building a website to track club events. I need someone who knows React for the frontend and maybe Firebase for the backend...'"
          className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
          rows="5"
        ></textarea>
        <div className="flex justify-end items-center mt-4">
          <button
            type="submit"
            disabled={isLoading}
            className="flex items-center justify-center bg-emerald-600 text-white px-5 py-2 rounded-md hover:bg-emerald-700 disabled:bg-emerald-300 shadow-md hover:shadow-lg transition-all"
          >
            {isLoading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <BrainCircuit size={18} className="mr-2" />
            )}
            Find Matches
          </button>
        </div>
      </form>

      {/* Results */}
      <div className="space-y-4">
        {isLoading && <LoadingSpinner size={32} />}
        {!isLoading && matches.length > 0 && (
          <>
            <h3 className="text-2xl font-bold text-gray-800">Top Matches</h3>
            {matches.map((match) => (
              <UserMatchCard key={match.userId} match={match} />
            ))}
          </>
        )}
        {!isLoading && !matches.length && projectDesc && (
          <p className="text-center text-gray-500">
            No strong matches found. Try broadening your project description.
          </p>
        )}
      </div>
    </div>
  );
};


// --- NEW FEATURE: Projects Page ---
const ProjectsPage = ({ userId, user, showModal, setPage }) => {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [authorName, setAuthorName] = useState('...'); // State for author name

  // Fetch current user's name for posting
  useEffect(() => {
    if (userId) {
      const fetchUserName = async () => {
        const userRef = doc(db, `artifacts/${appId}/public/data/users`, userId);
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
          setAuthorName(docSnap.data().name);
        } else {
          setAuthorName(user.email); // Fallback
        }
      };
      fetchUserName();
    }
  }, [userId, user.email]);

  // Fetch all projects
  useEffect(() => {
    setIsLoading(true);
    const projectsCol = collection(db, `artifacts/${appId}/public/data/projects`);
    const q = query(projectsCol);

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const projectsList = [];
      querySnapshot.forEach((doc) => {
        projectsList.push({ id: doc.id, ...doc.data() });
      });
      // Sort in memory (newest first)
      projectsList.sort((a, b) => {
        const timeA = a.createdAt?.toDate() || 0;
        const timeB = b.createdAt?.toDate() || 0;
        return timeB - timeA;
      });
      setProjects(projectsList);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching projects:", error);
      showModal("Error", "Could not load projects.");
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [showModal]);

  const timeAgo = (date) => {
    if (!date) return 'just now';
    const seconds = Math.floor((new Date() - date.toDate()) / 1000);
    let interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return "just now";
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-gray-900">
          Projects
        </h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center justify-center bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 shadow-md hover:shadow-lg transition-all"
        >
          <Plus size={18} className="mr-2" />
          Post a Project
        </button>
      </div>

      {/* Project List */}
      <div className="space-y-6">
        {isLoading && <LoadingSpinner size={32} />}
        {!isLoading && projects.length === 0 && (
          <p className="text-center text-gray-500">No projects listed yet. Be the first to post!</p>
        )}
        {projects.map((project) => (
          <div key={project.id} className="bg-white p-5 rounded-xl shadow-lg">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">{project.title}</h3>
                <button 
                  onClick={() => setPage({ name: 'profile', props: { profileId: project.authorId } })}
                  className="text-sm text-gray-500 hover:text-emerald-600 hover:underline"
                >
                  by {project.authorName}
                </button>
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{timeAgo(project.createdAt)}</span>
            </div>
            <p className="text-gray-700 whitespace-pre-wrap my-3">{project.description}</p>
            <div className="flex flex-wrap gap-2">
              <span className="text-xs font-semibold text-gray-600">Skills needed:</span>
              {project.skills.map((skill, index) => (
                <span key={index} className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-xs font-medium rounded-full">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      {/* Create Project Modal */}
      {showCreateModal && (
        <CreateProjectModal 
          userId={userId} 
          authorName={authorName} // Pass the fetched author name
          showModal={showModal} 
          onClose={() => setShowCreateModal(false)} 
        />
      )}
    </div>
  );
};

// --- NEW FEATURE: Create Project Modal ---
const CreateProjectModal = ({ userId, authorName, showModal, onClose }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [skills, setSkills] = useState('');
  const [isPosting, setIsPosting] = useState(false);

  const handlePostProject = async (e) => {
    e.preventDefault();
    if (title.trim() === '' || description.trim() === '' || skills.trim() === '') {
      showModal("Incomplete Form", "Please fill out all fields.");
      return;
    }
    
    setIsPosting(true);
    
    const skillsArray = skills.split(',').map(s => s.trim()).filter(s => s);

    try {
      const projectsCol = collection(db, `artifacts/${appId}/public/data/projects`);
      await addDoc(projectsCol, {
        title: title,
        description: description,
        skills: skillsArray,
        authorId: userId,
        authorName: authorName,
        createdAt: serverTimestamp(),
      });
      showModal("Success!", "Your project has been posted.");
      onClose();
    } catch (error) {
      console.error("Error posting project:", error);
      showModal("Error", "Could not post your project.");
    }
    setIsPosting(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
        >
          <X size={20} />
        </button>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Post a New Project
        </h3>
        <form onSubmit={handlePostProject} className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">Project Title</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
           <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows="4"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
            ></textarea>
          </div>
           <div>
            <label htmlFor="skills" className="block text-sm font-medium text-gray-700">Skills Needed (comma-separated)</label>
            <input
              id="skills"
              type="text"
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              placeholder="e.g., React, Python, UI/UX Design"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          <button
            type="submit"
            disabled={isPosting}
            className="mt-4 w-full flex items-center justify-center bg-emerald-600 text-white px-5 py-2 rounded-md hover:bg-emerald-700 disabled:bg-emerald-300 shadow-md hover:shadow-lg transition-all"
          >
            {isPosting ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Plus size={18} className="mr-2" />
            )}
            Post Project
          </button>
        </form>
      </div>
    </div>
  );
};


/**
 * User Directory Page
 */
const UserDirectoryPage = ({ setPage }) => {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoading(true);
      try {
        const usersCol = collection(db, `artifacts/${appId}/public/data/users`);
        const userSnapshot = await getDocs(usersCol);
        const userList = userSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sort in memory by name
        userList.sort((a, b) => a.name.localeCompare(b.name));
        setUsers(userList);
      } catch (error) {
        console.error("Error fetching user directory:", error);
      }
      setIsLoading(false);
    };
    fetchUsers();
  }, []);

  const UserRow = ({ user }) => (
    <li className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-white rounded-xl shadow-lg transition-shadow duration-300 hover:shadow-xl">
      <div className="flex items-center space-x-3">
        <div className="flex-shrink-0 bg-gray-200 rounded-full h-10 w-10 flex items-center justify-center">
          <User size={20} className="text-gray-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">{user.name}</p>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>
      </div>
      <div className="w-full sm:w-auto flex flex-col sm:items-end gap-2">
         <p className="text-sm text-gray-600 capitalize">{user.role}</p>
         <button
            onClick={() => setPage({ name: 'profile', props: { profileId: user.id } })}
            className="w-full sm:w-auto px-3 py-1 bg-emerald-50 text-emerald-700 text-sm rounded-md hover:bg-emerald-100 transition-colors text-center"
          >
            View Profile
          </button>
      </div>
    </li>
  );

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      <h2 className="text-3xl font-bold text-gray-900 mb-6">
        User Directory
      </h2>
      {isLoading ? (
        <LoadingSpinner size={32} />
      ) : (
        <ul className="space-y-3">
          {users.map(user => (
            <UserRow key={user.id} user={user} />
          ))}
        </ul>
      )}
    </div>
  );
};


/**
 * Profile Page Component
 */
const ProfilePage = ({ currentUserId, currentUser, showModal, setPage, profileId }) => {
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    skills: '',
    linkedin: '',
    github: '',
  });
  const [bioKeywords, setBioKeywords] = useState('');
  const [isGeneratingBio, setIsGeneratingBio] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false); // New state for message modal
  const [authorName, setAuthorName] = useState('...'); // State for author name

  const isOwnProfile = currentUserId === profileId;
  
  // Fetch current user's name (for sending messages)
  useEffect(() => {
    if (currentUser) {
       const fetchUserName = async () => {
        const userRef = doc(db, `artifacts/${appId}/public/data/users`, currentUserId);
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
          setAuthorName(docSnap.data().name);
        } else {
          setAuthorName(currentUser.email); // Fallback
        }
      };
      fetchUserName();
    }
  }, [currentUserId, currentUser]);


  // Fetch profile data
  useEffect(() => {
    if (!profileId) {
       setIsLoading(false);
       return;
    };

    setIsLoading(true);
    const fetchProfile = async () => {
      try {
        const userRef = doc(db, `artifacts/${appId}/public/data/users`, profileId);
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setProfile(data);
          // Pre-fill form data
          setFormData({
            name: data.name || '',
            bio: data.bio || '',
            skills: (data.skills || []).join(', '),
            linkedin: data.linkedin || '',
            github: data.github || '',
          });
        } else {
          showModal("Error", "Profile not found.");
          setProfile(null);
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
        showModal("Error", "Could not load profile.");
      }
      setIsLoading(false);
    };

    fetchProfile();
  }, [profileId, showModal]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    
    const skillsArray = formData.skills
      .split(',')
      .map(skill => skill.trim())
      .filter(skill => skill !== '');

    const updatedData = {
      name: formData.name,
      bio: formData.bio,
      skills: skillsArray,
      linkedin: formData.linkedin,
      github: formData.github,
    };

    try {
      const userRef = doc(db, `artifacts/${appId}/public/data/users`, currentUserId);
      await updateDoc(userRef, updatedData);
      setProfile(prev => ({ ...prev, ...updatedData }));
      setIsEditing(false);
      showModal("Success", "Your profile has been updated.");
    } catch (error) {
       console.error("Error updating profile:", error);
       showModal("Error", "Could not save your profile.");
    }
    setIsSaving(false);
  };

  const handleGenerateBio = async () => {
    if (bioKeywords.trim() === '') {
      showModal("Keywords Needed", "Please enter a few keywords for the AI to write your bio.");
      return;
    }
    setIsGeneratingBio(true);
    try {
      const systemPrompt = "You are a helpful assistant writing a professional, first-person bio for a student's profile on a college collaboration portal. The bio should be 2-3 sentences long. Be friendly but professional.";
      const userPrompt = `Generate a bio based on these keywords: "${bioKeywords}"`;

      const payload = {
        contents: [{ parts: [{ text: userPrompt }] }],
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        },
      };

      const generatedBio = await callGeminiApi(payload);
      setFormData(prev => ({ ...prev, bio: generatedBio.trim() }));
      
    } catch (error) {
      console.error("Error generating bio:", error);
      showModal("AI Error", "Could not generate bio. Please try again.\n" + error.message);
    }
    setIsGeneratingBio(false);
  };


  if (isLoading) {
    return (
      <div className="flex-grow pt-20">
        <LoadingSpinner size={40} />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <p className="text-xl text-gray-600">Profile not found.</p>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="bg-white shadow-2xl rounded-xl overflow-hidden">
          <div className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex-shrink-0 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full h-24 w-24 flex items-center justify-center shadow-lg">
                  <User size={48} className="text-white" />
                </div>
                <div>
                  {isEditing ? (
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      className="text-2xl font-bold text-gray-900 border-b-2 border-gray-300 focus:border-emerald-500 outline-none"
                    />
                  ) : (
                    <h2 className="text-3xl font-bold text-gray-900">{profile.name}</h2>
                  )}
                  <p className="text-md text-gray-600 capitalize">{profile.role}</p>
                  <p className="text-sm text-gray-500">{profile.email}</p>
                </div>
              </div>
              <div className="mt-4 sm:mt-0 flex-shrink-0">
                {isOwnProfile ? (
                  isEditing ? (
                    <div className="flex space-x-2">
                       <button
                          onClick={() => setIsEditing(false)}
                          className="flex items-center bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 transition-colors"
                        >
                          <X size={18} className="mr-1" />
                          Cancel
                        </button>
                      <button
                        onClick={handleSaveProfile}
                        disabled={isSaving}
                        className="flex items-center bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:bg-green-300 transition-colors"
                      >
                        {isSaving ? <Loader2 className="animate-spin" /> : <Save size={18} className="mr-1" />}
                        Save
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="flex items-center bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 transition-all shadow-md hover:shadow-lg"
                    >
                      <Edit size={18} className="mr-1" />
                      Edit Profile
                    </button>
                  )
                ) : (
                  // --- NEW: Send Message Button ---
                  <button
                    onClick={() => setIsSendingMessage(true)}
                    className="flex items-center bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 transition-all shadow-md hover:shadow-lg"
                  >
                    <MessageCircle size={18} className="mr-1" />
                    Send Message
                  </button>
                )}
              </div>
            </div>

            {/* Profile Details */}
            <div className="mt-8 space-y-6">
              {/* Bio */}
              <div>
                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Bio</h4>
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      name="bio"
                      value={formData.bio}
                      onChange={handleInputChange}
                      placeholder="Tell everyone a bit about yourself..."
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                    />
                    <div className="p-3 bg-emerald-50 rounded-md border border-emerald-200 space-y-2">
                      <label htmlFor="bio-keywords" className="block text-xs font-medium text-emerald-800">
                        ✨ Get help from AI
                      </label>
                      <div className="flex space-x-2">
                         <input
                          id="bio-keywords"
                          type="text"
                          value={bioKeywords}
                          onChange={(e) => setBioKeywords(e.target.value)}
                          placeholder="Keywords: e.g., '3rd year CS, loves React'"
                          className="flex-grow px-3 py-1.5 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={handleGenerateBio}
                          disabled={isGeneratingBio}
                          className="flex-shrink-0 bg-emerald-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-emerald-700 disabled:bg-emerald-300 transition-colors flex items-center"
                        >
                          {isGeneratingBio ? (
                            <Loader2 size={16} className="animate-spin mr-1" />
                          ) : (
                            <Sparkles size={16} className="mr-1" />
                          )}
                          Generate
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-gray-800 whitespace-pre-wrap">
                    {profile.bio || <span className="text-gray-400 italic">No bio provided.</span>}
                  </p>
                )}
              </div>

               {/* Skills */}
              <div>
                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Skills</h4>
                {isEditing ? (
                   <input
                      type="text"
                      name="skills"
                      value={formData.skills}
                      onChange={handleInputChange}
                      placeholder="e.g., Python, React, Data Analysis"
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                   />
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {profile.skills && profile.skills.length > 0 ? (
                      profile.skills.map((skill, index) => (
                        <span key={index} className="px-3 py-1 bg-emerald-100 text-emerald-800 text-sm font-medium rounded-full">
                          {skill}
                        </span>
                      ))
                    ) : (
                       <span className="text-gray-400 italic">No skills listed.</span>
                    )}
                  </div>
                )}
                {isEditing && <p className="text-xs text-gray-500 mt-1">Enter skills separated by commas.</p>}
              </div>

              {/* Links */}
               <div>
                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Links</h4>
                 <div className="mt-2 space-y-2">
                   {isEditing ? (
                    <>
                      <input
                        type="text"
                        name="github"
                        value={formData.github}
                        onChange={handleInputChange}
                        placeholder="GitHub URL (e.g., https://github.com/username)"
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                      />
                       <input
                        type="text"
                        name="linkedin"
                        value={formData.linkedin}
                        onChange={handleInputChange}
                        placeholder="LinkedIn URL (e.g., https://linkedin.com/in/username)"
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                      />
                    </>
                   ) : (
                    <>
                      <p className="text-gray-800">
                        <strong>GitHub:</strong>{' '}
                        {profile.github ? (
                          <a href={profile.github} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">{profile.github}</a>
                        ) : (
                          <span className="text-gray-400 italic">Not provided</span>
                        )}
                      </p>
                      <p className="text-gray-800">
                        <strong>LinkedIn:</strong>{' '}
                        {profile.linkedin ? (
                          <a href={profile.linkedin} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">{profile.linkedin}</a>
                        ) : (
                           <span className="text-gray-400 italic">Not provided</span>
                        )}
                      </p>
                    </>
                   )}
                 </div>
              </div>

            </div>
          </div>
        </div>
      </div>
      
      {/* --- NEW: Send Message Modal --- */}
      {isSendingMessage && (
        <SendMessageModal 
          recipientId={profileId}
          recipientName={profile.name}
          currentUserId={currentUserId}
          authorName={authorName} // Pass the fetched author name
          showModal={showModal}
          onClose={() => setIsSendingMessage(false)}
        />
      )}
    </>
  );
};

/**
 * Footer Component
 */
const Footer = () => (
  <footer className="w-full bg-gray-100 border-t border-gray-200 mt-12 py-6">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500">
      <p>&copy; {new Date().getFullYear()} CollabNest. All rights reserved.</p>
      <p className="mt-1">
        For support, contact: <a href="mailto:collabnest.iilm@gmail.com" className="font-medium text-emerald-600 hover:text-emerald-500">collabnest.iilm@gmail.com</a>
      </p>
    </div>
  </footer>
);


// --- Main App Component ---

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
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser && !currentUser.isAnonymous) {
        setUser(currentUser);
        setUserId(currentUser.uid);
        if (page.name === 'login' || page.name === 'signup') {
          setPage({ name: 'dashboard' });
        }
      } else {
        setUser(null);
        setUserId(null);
        setPage({ name: 'login' });
      }
      setIsAuthReady(true);
    });


    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setPage({ name: 'login' });
    } catch (error) {
      console.error("Logout Error:", error);
      showModal('Logout Failed', 'An error occurred while logging out.');
    }
  };

  // --- Page Router ---
  const renderPage = () => {
    if (!isAuthReady) {
      return (
        <div className="flex-grow flex items-center justify-center">
          <LoadingSpinner size={40} />
        </div>
      );
    }

    if (!user) {
      switch (page.name) {
        case 'signup':
          return <SignUpPage setPage={setPage} showModal={showModal} />;
        case 'login':
        default:
          return <LoginPage setPage={setPage} showModal={showModal} />;
      }
    }

    // User is logged in
    switch (page.name) {
      case 'dashboard':
        return <DashboardPage userId={userId} user={user} showModal={showModal} />;
      case 'projects': // NEW
        return <ProjectsPage userId={userId} user={user} showModal={showModal} setPage={setPage} />;
      case 'search':
        return <SearchPage setPage={setPage} />;
      case 'ai_matcher': // NEW
        return <AIMatcherPage userId={userId} showModal={showModal} setPage={setPage} />;
      case 'inbox': // NEW
        return <InboxPage userId={userId} showModal={showModal} setPage={setPage} />;
      case 'users':
        return <UserDirectoryPage setPage={setPage} />;
      case 'ai_assistant':
        return <AIAssistantPage showModal={showModal} />;
      case 'profile':
        return (
          <ProfilePage
            currentUserId={userId}
            currentUser={user} // Pass full user object
            profileId={page.props?.profileId || userId}
            showModal={showModal}
            setPage={setPage}
          />
        );
      default:
        return <DashboardPage userId={userId} user={user} showModal={showModal} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-inter">
      <Navbar user={user} setPage={setPage} handleLogout={handleLogout} />
      <main className="flex-grow w-full">
        {renderPage()}
      </main>
      <Footer />
      <Modal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        onClose={closeModal}
      />
    </div>
  );
}

