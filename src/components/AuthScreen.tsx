import React, { useState } from "react";
import { User } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { ClipboardList, Shield, KeyRound, UserPlus, LogIn, Mail, CheckCircle, AlertCircle, Eye, EyeOff, RefreshCw } from "lucide-react";
import { isSupabaseConfigured, dbSignIn, dbSignUp, normalizeUserString } from "../supabase";
import { NexvoltLogo } from "./NexvoltLogo";

interface AuthScreenProps {
  onLoginSuccess: (user: User) => void;
}

export function AuthScreen({ onLoginSuccess }: AuthScreenProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Feedback states
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Fetch existing users from localStorage or return default demo user
  const getRegisteredUsers = (): User[] => {
    const saved = localStorage.getItem("NUCLEO_USERS");
    if (saved) return JSON.parse(saved);
    
    // Default system user
    const defaultUser: User = {
      id: "demo-admin",
      username: "admin",
      name: "Administrador",
      email: "vendas.impactodigital2@gmail.com",
      password: "123"
    };
    return [defaultUser];
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const trimmedUser = username.trim();
    if (!trimmedUser || !password) {
      setError("Por favor, preencha todos os campos do formulário.");
      setLoading(false);
      return;
    }

    if (isSupabaseConfigured()) {
      try {
        const { user, error: loginError } = await dbSignIn(trimmedUser, password);
        setLoading(false);
        if (loginError) {
          setError(loginError);
        } else if (user) {
          onLoginSuccess(user);
        } else {
          setError("Erro inesperado ao realizar login.");
        }
        return;
      } catch (err: any) {
        console.error("Supabase authentication failed:", err);
        setError(err.message || "Erro de conexão com o Supabase.");
        setLoading(false);
        return;
      }
    }

    // Local compatibility fallback:
    const users = getRegisteredUsers();
    const foundUser = users.find((u) => {
      const userLogin = normalizeUserString(u.username || "");
      const userEmail = normalizeUserString(u.email || "");
      const targetLogin = normalizeUserString(trimmedUser);
      const matchesUsername = userLogin === targetLogin || userEmail === targetLogin;
      
      const storedPass = u.password || "";
      const [mainPass] = storedPass.split("::");
      const matchesPassword = mainPass === password || storedPass === password;
      return matchesUsername && matchesPassword;
    });

    setLoading(false);
    if (foundUser) {
      onLoginSuccess(foundUser);
    } else {
      setError("Usuário ou senha incorretos. Tente novamente.");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const trimmedUser = username.trim();
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedUser || !password || !confirmPassword || !trimmedName) {
      setError("Por favor, preencha todos os campos obrigatórios.");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas digitadas não coincidem.");
      setLoading(false);
      return;
    }

    if (password.length < 3) {
      setError("A senha deve ter pelo menos 3 caracteres.");
      setLoading(false);
      return;
    }

    if (isSupabaseConfigured()) {
      try {
        const { user, error: registerError } = await dbSignUp(trimmedName, trimmedUser, trimmedEmail, password);
        setLoading(false);
        if (registerError) {
          setError(registerError);
        } else if (user) {
          setSuccess("Cadastro realizado com sucesso via Supabase Auth! Você já pode entrar.");
          // Clear inputs
          setUsername("");
          setPassword("");
          setConfirmPassword("");
          setFullName("");
          setEmail("");
          
          setTimeout(() => {
            setIsRegister(false);
            setSuccess(null);
            setUsername(trimmedUser);
          }, 1500);
        } else {
          setError("Erro inesperado ao registrar funcionário.");
        }
        return;
      } catch (err: any) {
        console.error("Supabase sign up failed:", err);
        setError(err.message || "Erro de conexão com o Supabase.");
        setLoading(false);
        return;
      }
    }

    // Local compatibility fallback:
    const lowercaseUser = trimmedUser.toLowerCase();
    const users = getRegisteredUsers();
    const userExists = users.some((u) => u.username.toLowerCase() === lowercaseUser);

    if (userExists) {
      setError("Este nome de usuário já está sendo utilizado por outra pessoa.");
      setLoading(false);
      return;
    }

    // Helper to generate a valid RFC4122 v4 UUID
    const generateUserUUID = (): string => {
      if (typeof window !== "undefined" && window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
      }
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    };

    const newUser: User = {
      id: generateUserUUID(),
      name: trimmedName,
      username: lowercaseUser,
      email: trimmedEmail || undefined,
      password: password,
      status_assinatura: "trial",
      created_at: new Date().toISOString()
    };

    const updatedUsers = [...users, newUser];
    localStorage.setItem("NUCLEO_USERS", JSON.stringify(updatedUsers));

    setLoading(false);
    setSuccess("Cadastro realizado com sucesso! Você já pode entrar.");
    
    // Reset form fields
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setFullName("");
    setEmail("");

    // Flip to login screen after a slight delay
    setTimeout(() => {
      setIsRegister(false);
      setSuccess(null);
      // Auto-populate the username for the new user
      setUsername(trimmedUser);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-brand-dark-navy flex items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Absolute backdrops/atmospherics */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-64 h-64 sm:w-96 sm:h-96 rounded-full bg-brand-magenta/10 blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-64 h-64 sm:w-96 sm:h-96 rounded-full bg-brand-cyan/10 blur-[100px] pointer-events-none"></div>

      {/* Main Container */}
      <div className="w-full max-w-md relative z-10">
        
        {/* Branding Title */}
        <div className="text-center mb-6 flex flex-col items-center justify-center">
          <NexvoltLogo showText={true} iconSize={52} className="mb-3" />
          <p className="text-[10px] tracking-widest font-black text-slate-400 uppercase font-mono mt-1">
            SISTEMA DE VENDA · CONTROLE FINANCEIRO · NÚCLEO
          </p>
        </div>

        {/* Content Card with motion */}
        <motion.div 
          layout
          className="bg-brand-card border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black h-auto select-none overflow-hidden relative"
        >
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand-magenta via-purple-500 to-brand-cyan"></div>
          
          <AnimatePresence mode="wait">
            {!isRegister ? (
              // LOGIN FORM
              <motion.div
                key="login-view"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.25 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <LogIn className="h-5 w-5 text-brand-magenta" />
                    Iniciar Sessão
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Acesse a plataforma para registrar vendas, emitir comprovantes e controlar gastos.</p>
                </div>

                {error && (
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-405 font-medium text-xs text-balance"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                    <span>{error}</span>
                  </motion.div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">E-mail de Acesso</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                        <Mail className="h-4 w-4" />
                      </span>
                      <input
                        type="text"
                        autoCapitalize="none"
                        autoComplete="email"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Ex: seuemail@provedor.com"
                        className="w-full bg-slate-950 font-medium text-slate-100 placeholder-slate-600 text-sm border border-slate-850 rounded-xl py-3 pl-10 pr-4 outline-none focus:border-brand-magenta transition-colors"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">Senha de Acesso</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                        <KeyRound className="h-4 w-4" />
                      </span>
                      <input
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Insira sua senha"
                        className="w-full bg-slate-950 font-medium text-slate-100 placeholder-slate-600 text-sm border border-slate-850 rounded-xl py-3 pl-10 pr-12 outline-none focus:border-brand-magenta transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-350 cursor-pointer p-1"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 px-4 rounded-xl font-bold text-white bg-gradient-to-r from-brand-magenta to-pink-600 hover:from-pink-650 hover:to-brand-magenta transition-all cursor-pointer transform active:scale-95 text-sm shadow-lg shadow-brand-magenta/25 flex items-center justify-center gap-2 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <RefreshCw className="h-4 w-4 text-pink-100 animate-spin" />
                    ) : (
                      <LogIn className="h-4 w-4 text-pink-100" />
                    )}
                    <span>{loading ? "Carregando..." : "Acessar o Sistema"}</span>
                  </button>
                </form>

                <div className="pt-4 border-t border-slate-850 text-center">
                  <p className="text-xs text-slate-400">
                    Ainda não possui conta?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setSuccess(null);
                        setIsRegister(true);
                      }}
                      className="text-brand-cyan hover:underline font-bold bg-transparent border-none cursor-pointer p-1 text-xs"
                    >
                      Criar Novo Cadastro
                    </button>
                  </p>
                </div>
              </motion.div>
            ) : (
              // REGISTER FORM 
              <motion.div
                key="register-view"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-brand-cyan" />
                    Criar Novo Registro
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Crie sua conta para acessar o sistema localmente.</p>
                </div>

                {error && (
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-405 font-medium text-xs text-balance"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                    <span>{error}</span>
                  </motion.div>
                )}

                {success && (
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium text-xs text-balance animate-pulse"
                  >
                    <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                    <span>{success}</span>
                  </motion.div>
                )}

                <form onSubmit={handleRegister} className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">Nome Completo *</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Ex: João da Silva"
                      className="w-full bg-slate-950 font-medium text-slate-100 placeholder-slate-600 text-xs sm:text-sm border border-slate-850 rounded-xl py-2.5 px-3 outline-none focus:border-brand-cyan transition-colors"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">Usuário de Login *</label>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Ex: joaosilva (sem espaços)"
                      className="w-full bg-slate-950 font-medium text-slate-100 placeholder-slate-600 text-xs sm:text-sm border border-slate-850 rounded-xl py-2.5 px-3 outline-none focus:border-brand-cyan transition-colors"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">E-mail (Opcional)</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                        <Mail className="h-4 w-4" />
                      </span>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Ex: joao@designer.com"
                        className="w-full bg-slate-950 font-medium text-slate-100 placeholder-slate-600 text-xs sm:text-sm border border-slate-850 rounded-xl py-2.5 pl-10 pr-3 outline-none focus:border-brand-cyan transition-colors"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="space-y-1">
                      <label className="block text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">Senha *</label>
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Mín. 3 dig."
                        className="w-full bg-slate-950 font-medium text-slate-100 placeholder-slate-600 text-xs border border-slate-850 rounded-xl py-2.5 px-3 outline-none focus:border-brand-cyan transition-colors"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">Confirmar *</label>
                      <input
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repita a senha"
                        className="w-full bg-slate-950 font-medium text-slate-100 placeholder-slate-600 text-xs border border-slate-850 rounded-xl py-2.5 px-3 outline-none focus:border-brand-cyan transition-colors"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-xl font-bold text-slate-950 bg-gradient-to-r from-brand-cyan to-blue-400 hover:from-blue-400 hover:to-brand-cyan transition-all cursor-pointer transform active:scale-95 text-xs sm:text-sm shadow-lg shadow-brand-cyan/25 flex items-center justify-center gap-2 mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4 shrink-0" />
                    )}
                    <span>{loading ? "Cadastrando..." : "Finalizar Cadastro"}</span>
                  </button>
                </form>

                <div className="pt-3 border-t border-slate-850 text-center">
                  <p className="text-xs text-slate-400">
                    Já possui uma conta?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setSuccess(null);
                        setIsRegister(false);
                      }}
                      className="text-brand-magenta hover:underline font-bold bg-transparent border-none cursor-pointer p-1 text-xs"
                    >
                      Fazer Login
                    </button>
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Demo Credentials hint widget removed */}
        
      </div>
    </div>
  );
}
