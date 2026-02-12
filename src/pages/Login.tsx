import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import logo from "@/assets/logo.png";

const Login = () => {
  const [mode, setMode] = useState<"home" | "login" | "register">("home");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useUser();

  const sendUserToWebhook = async (userData: { id: string; nome: string; email: string; bloqueado: boolean }) => {
    try {
      const response = await fetch("https://n8n-production-dabf.up.railway.app/webhook/chat-trilingo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: userData.id,
          nome: userData.nome,
          email: userData.email,
          bloqueado: userData.bloqueado,
          message: "login",
        }),
      });
      if (response.ok) {
        return await response.json();
      }
    } catch { /* silently fail */ }
    return null;
  };

  const handleLogin = async () => {
    if (!email.trim()) { setError("Informe seu email."); return; }
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase
      .from("usuarios")
      .select("*")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();

    if (err) { setError("Erro ao buscar usuário."); setLoading(false); return; }
    if (!data) { setError("Email não encontrado. Faça seu registro primeiro!"); setLoading(false); return; }

    setUser({ id: data.id, nome: data.nome, email: data.email });

    // Busca o status atualizado diretamente do Supabase antes de enviar para o webhook
    const { data: updatedData } = await supabase
      .from("usuarios")
      .select("bloqueado")
      .eq("id", data.id)
      .single();

    const webhookResponse = await sendUserToWebhook({
      id: data.id,
      nome: data.nome,
      email: data.email,
      bloqueado: updatedData?.bloqueado || false
    });
    setLoading(false);
    navigate("/chat", {
      state: {
        webhookResponse,
        isInitiallyBlocked: updatedData?.bloqueado || false
      }
    });
  };

  const handleRegister = async () => {
    if (!name.trim() || !email.trim()) { setError("Preencha todos os campos."); return; }
    setLoading(true);
    setError("");

    const { data, error: err } = await supabase
      .from("usuarios")
      .insert({ nome: name.trim(), email: email.trim().toLowerCase() })
      .select()
      .single();

    if (err) {
      if (err.code === "23505") {
        setError("Este email já está cadastrado. Faça login!");
      } else {
        setError("Erro ao registrar. Tente novamente.");
      }
      setLoading(false);
      return;
    }

    setUser({ id: data.id, nome: data.nome, email: data.email });
    const webhookResponse = await sendUserToWebhook({
      id: data.id,
      nome: data.nome,
      email: data.email,
      bloqueado: data.bloqueado || false
    });
    setLoading(false);
    navigate("/chat", {
      state: {
        webhookResponse,
        isInitiallyBlocked: data.bloqueado || false
      }
    });
  };

  if (mode === "home") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <img src={logo} alt="Trilingo" className="w-48 h-48 object-contain mb-8" />
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Button size="lg" className="w-full text-lg font-bold rounded-xl" onClick={() => { setError(""); setMode("login"); }}>
            Login
          </Button>
          <Button size="lg" variant="outline" className="w-full text-lg font-bold rounded-xl" onClick={() => { setError(""); setMode("register"); }}>
            Registro
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "login") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <img src={logo} alt="Trilingo" className="w-32 h-32 object-contain mb-6" />
        <h1 className="text-2xl font-bold mb-6 text-foreground">Login</h1>
        <div className="w-full max-w-xs space-y-4">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button size="lg" className="w-full text-lg font-bold rounded-xl" onClick={handleLogin} disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => { setError(""); setMode("home"); }}>
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <img src={logo} alt="Trilingo" className="w-32 h-32 object-contain mb-6" />
      <h1 className="text-2xl font-bold mb-6 text-foreground">Registro</h1>
      <div className="w-full max-w-xs space-y-4">
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <div className="space-y-2">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" type="text" placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email-reg">Email</Label>
          <Input id="email-reg" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button size="lg" className="w-full text-lg font-bold rounded-xl" onClick={handleRegister} disabled={loading}>
          {loading ? "Registrando..." : "Registrar"}
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => { setError(""); setMode("home"); }}>
          Voltar
        </Button>
      </div>
    </div>
  );
};

export default Login;
