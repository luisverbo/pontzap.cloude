import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import logoPontzap from '@/assets/logo-pontzap.png';
import logoPontzapBranca from '@/assets/logo-pontzap-branca.png';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
});

const signupSchema = loginSchema.extend({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Senhas não coincidem',
  path: ['confirmPassword'],
});

const resetPasswordSchema = z.object({
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Senhas não coincidem',
  path: ['confirmPassword'],
});

type AuthMode = 'login' | 'signup' | 'forgot-password' | 'reset-password';

export default function Auth() {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, user } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();

  const logoSrc = theme === 'dark' ? logoPontzapBranca : logoPontzap;

  // Check for password reset token in URL
  useEffect(() => {
    const handleAuthRedirect = async () => {
      // Check for hash fragment (Supabase sends tokens in hash)
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const type = hashParams.get('type');
      const errorCode = hashParams.get('error_code');
      const errorDescription = hashParams.get('error_description');
      
      // Handle error in URL (e.g., expired link)
      if (errorCode || errorDescription) {
        const message = errorDescription?.replace(/\+/g, ' ') || 'Link inválido ou expirado';
        toast.error(message);
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }
      
      if (accessToken && type === 'recovery') {
        // Set session from recovery token
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: hashParams.get('refresh_token') || '',
        });
        
        if (!error) {
          setMode('reset-password');
          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          toast.error('Link de recuperação inválido ou expirado');
        }
        return;
      }

      // Also listen for auth state changes from Supabase PKCE flow
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          setMode('reset-password');
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    };

    handleAuthRedirect();
  }, []);

  useEffect(() => {
    if (user && mode !== 'reset-password') {
      navigate('/', { replace: true });
    }
  }, [user, navigate, mode]);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Digite seu email');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      });

      if (error) {
        toast.error('Erro ao enviar email de recuperação');
      } else {
        toast.success('Email de recuperação enviado! Verifique sua caixa de entrada.');
        setMode('login');
      }
    } catch (error) {
      toast.error('Erro ao enviar email de recuperação');
    }
    setLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validation = resetPasswordSchema.safeParse({ password, confirmPassword });
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      
      if (error) {
        toast.error('Erro ao redefinir senha');
      } else {
        toast.success('Senha redefinida com sucesso!');
        await supabase.auth.signOut();
        setMode('login');
        setPassword('');
        setConfirmPassword('');
      }
    } catch (error) {
      toast.error('Erro ao redefinir senha');
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === 'login') {
        const validation = loginSchema.safeParse({ email, password });
        if (!validation.success) {
          toast.error(validation.error.errors[0].message);
          setLoading(false);
          return;
        }

        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast.error('Email ou senha incorretos');
          } else {
            toast.error('Erro ao fazer login. Tente novamente.');
          }
        } else {
          toast.success('Login realizado com sucesso!');
          navigate('/', { replace: true });
        }
      } else if (mode === 'signup') {
        const validation = signupSchema.safeParse({ email, password, confirmPassword, name });
        if (!validation.success) {
          toast.error(validation.error.errors[0].message);
          setLoading(false);
          return;
        }

        const { error } = await signUp(email, password, name);
        if (error) {
          if (error.message.includes('already registered')) {
            toast.error('Este email já está cadastrado');
          } else {
            toast.error('Erro ao criar conta. Tente novamente.');
          }
        } else {
          toast.success('Conta criada com sucesso!');
          navigate('/', { replace: true });
        }
      }
    } catch (error) {
      toast.error('Ocorreu um erro. Tente novamente.');
    }

    setLoading(false);
  };

  // Reset Password View
  if (mode === 'reset-password') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md animate-fade-in">
          <div className="flex flex-col items-center mb-8">
            <img src={logoSrc} alt="Logo PONTZAP" className="h-20 w-auto mb-4 object-contain" />
            <p className="text-muted-foreground">Redefinir Senha</p>
          </div>

          <Card variant="elevated">
            <CardHeader className="text-center">
              <CardTitle>Nova Senha</CardTitle>
              <CardDescription>
                Digite sua nova senha abaixo
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Nova Senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Salvando...
                    </>
                  ) : (
                    'Salvar Nova Senha'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Forgot Password View
  if (mode === 'forgot-password') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md animate-fade-in">
          <div className="flex flex-col items-center mb-8">
            <img src={logoSrc} alt="Logo PONTZAP" className="h-20 w-auto mb-4 object-contain" />
            <p className="text-muted-foreground">Recuperar Senha</p>
          </div>

          <Card variant="elevated">
            <CardHeader className="text-center">
              <CardTitle>Esqueceu sua senha?</CardTitle>
              <CardDescription>
                Digite seu email para receber um link de recuperação
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Enviando...
                    </>
                  ) : (
                    'Enviar Link de Recuperação'
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <button
                  type="button"
                  className="text-sm text-primary hover:underline flex items-center justify-center gap-1 w-full"
                  onClick={() => setMode('login')}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Voltar para o login
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src={logoSrc} alt="Logo PONTZAP" className="h-20 w-auto mb-4 object-contain" />
          <p className="text-muted-foreground">Controle de Ponto Inteligente</p>
        </div>

        <Card className="card-modern">
          <CardHeader className="text-center">
            <CardTitle>{mode === 'login' ? 'Entrar' : 'Criar Conta'}</CardTitle>
            <CardDescription>
              {mode === 'login'
                ? 'Acesse sua conta para gerenciar o ponto'
                : 'Preencha os dados para criar sua conta'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div className="space-y-2">
                  <Label htmlFor="name">Nome completo</Label>
                  <Input
                    id="name"
                    placeholder="Seu nome"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={loading}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Senha</Label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => setMode('forgot-password')}
                    >
                      Esqueceu a senha?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {mode === 'signup' && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar senha</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                  />
                </div>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    {mode === 'login' ? 'Entrando...' : 'Criando...'}
                  </>
                ) : (
                  mode === 'login' ? 'Entrar' : 'Criar conta'
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() => {
                  setMode(mode === 'login' ? 'signup' : 'login');
                  setPassword('');
                  setConfirmPassword('');
                }}
              >
                {mode === 'login' ? 'Não tem conta? Criar agora' : 'Já tem conta? Fazer login'}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}