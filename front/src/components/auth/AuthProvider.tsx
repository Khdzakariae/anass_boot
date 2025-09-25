import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { toast } from 'sonner';

// Assumed shape of the user object from your auth server
interface User {
  id: string;
  email: string;
  name?: string; // name is optional
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean; // To handle initial token check
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, name: string) => Promise<boolean>;
  // register: (email: string, password: name: string) => Promise<boolean>; // 'name' parameter added here
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const storedUser = localStorage.getItem('user');
    return storedUser ? JSON.parse(storedUser) : null;
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // On initial load, check if user exists in localStorage
    setIsLoading(false);
  }, []);

  const handleAuthSuccess = (userData: User, token: string) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', token); // ✅ store token
    toast.success('Authentication successful!');
  };
  

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch('http://localhost:3000/api/users/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });
  
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Login failed');
  
      // Expect backend to return { user, token }
      handleAuthSuccess(data.user, data.token);
      return true;
    } catch (err: any) {
      toast.error(err.message || 'Login failed');
      return false;
    }
  };
  

  const register = async (email: string, password: string, name: string): Promise<boolean> => {
    try {
      const response = await fetch('http://localhost:3000/api/users/sign-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
        credentials: 'include',
      });
  
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Registration failed');
  
      // Expect backend to return { user, token }
      handleAuthSuccess(data.user, data.token);
      return true;
    } catch (err: any) {
      toast.error(err.message || 'Registration failed');
      return false;
    }
  };
  
  const logout = async () => {
    try {
      await fetch('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      console.error('Logout failed:', err);
    }
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token'); // ✅ clear token
    toast.info('Logged out successfully.');
  };
  

  const value: AuthContextType = {
    user,
    token: localStorage.getItem('token'), // ✅ now available
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
  };
  

  if (isLoading) return <div>Loading...</div>;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
