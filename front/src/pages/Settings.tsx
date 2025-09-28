import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  KeyRound,
  MailCheck,
  RefreshCw,
  Save,
  Eye,
  EyeOff,
  Copy,
  ExternalLink,
  Undo2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface IntegrationSettings {
  geminiApiKey: string;
  geminiModel: string;
  smtpUser: string;
  smtpPass: string;
  smtpHost: string;
  smtpPort: string;
  updatedAt?: string;
  createdAt?: string;
}

const DEFAULT_SETTINGS: IntegrationSettings = {
  geminiApiKey: "",
  geminiModel: "gemini-1.5-flash",
  smtpUser: "",
  smtpPass: "",
  smtpHost: "smtp.gmail.com",
  smtpPort: "465",
};

const Settings = () => {
  const { user } = useAuth();
  const [formData, setFormData] = useState<IntegrationSettings>(DEFAULT_SETTINGS);
  const [initialData, setInitialData] = useState<IntegrationSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const fetchSettings = async () => {
    if (!token || token === "null") {
      toast.error("Authentication token missing. Please sign in again.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("http://localhost:3000/api/settings/integration", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Unable to load integration settings");
      }

      const data = await response.json();
      if (data?.settings) {
        const payload: IntegrationSettings = {
          geminiApiKey: data.settings.geminiApiKey || "",
          geminiModel: data.settings.geminiModel || DEFAULT_SETTINGS.geminiModel,
          smtpUser: data.settings.smtpUser || "",
          smtpPass: data.settings.smtpPass || "",
          smtpHost: data.settings.smtpHost || DEFAULT_SETTINGS.smtpHost,
          smtpPort: data.settings.smtpPort ? String(data.settings.smtpPort) : DEFAULT_SETTINGS.smtpPort,
          updatedAt: data.settings.updatedAt,
          createdAt: data.settings.createdAt,
        };
        setFormData(payload);
        setInitialData(payload);
      } else {
        setFormData(DEFAULT_SETTINGS);
        setInitialData(DEFAULT_SETTINGS);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to fetch integration settings");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (field: keyof IntegrationSettings, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const hasChanges = useMemo(() => {
    return (
      formData.geminiApiKey !== initialData.geminiApiKey ||
      formData.geminiModel !== initialData.geminiModel ||
      formData.smtpUser !== initialData.smtpUser ||
      formData.smtpPass !== initialData.smtpPass ||
      formData.smtpHost !== initialData.smtpHost ||
      formData.smtpPort !== initialData.smtpPort
    );
  }, [formData, initialData]);

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || token === "null") {
      toast.error("Authentication token missing. Please sign in again.");
      return;
    }

    if (!formData.geminiApiKey) {
      toast.warning("Gemini API key is required to generate letters.");
    }
    if (!formData.smtpUser || !formData.smtpPass) {
      toast.warning("SMTP user and password are required to send emails.");
    }

    setIsSaving(true);
    try {
      const response = await fetch("http://localhost:3000/api/settings/integration", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          geminiApiKey: formData.geminiApiKey.trim() || undefined,
          geminiModel: formData.geminiModel.trim() || undefined,
          smtpUser: formData.smtpUser.trim() || undefined,
          smtpPass: formData.smtpPass.trim() || undefined,
          smtpHost: formData.smtpHost.trim() || undefined,
          smtpPort: formData.smtpPort ? Number(formData.smtpPort) : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error?.error || "Failed to save settings");
      }

      const data = await response.json();
      const payload: IntegrationSettings = {
        geminiApiKey: data.settings.geminiApiKey || "",
        geminiModel: data.settings.geminiModel || DEFAULT_SETTINGS.geminiModel,
        smtpUser: data.settings.smtpUser || "",
        smtpPass: data.settings.smtpPass || "",
        smtpHost: data.settings.smtpHost || DEFAULT_SETTINGS.smtpHost,
        smtpPort: data.settings.smtpPort ? String(data.settings.smtpPort) : DEFAULT_SETTINGS.smtpPort,
        updatedAt: data.settings.updatedAt,
        createdAt: data.settings.createdAt,
      };
      setFormData(payload);
      setInitialData(payload);
      toast.success(data?.message || "Integration settings saved");
    } catch (error: any) {
      toast.error(error.message || "Could not save integration settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToDefaults = () => {
    setFormData((prev) => ({
      ...prev,
      smtpHost: DEFAULT_SETTINGS.smtpHost,
      smtpPort: DEFAULT_SETTINGS.smtpPort,
      geminiModel: DEFAULT_SETTINGS.geminiModel,
    }));
    toast.info("SMTP defaults restored");
  };

  const handleClearSecrets = () => {
    setFormData((prev) => ({
      ...prev,
      geminiApiKey: "",
      smtpUser: "",
      smtpPass: "",
    }));
    toast.info("Sensitive fields cleared. Don't forget to save!");
  };

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied to clipboard`);
    } catch (error) {
      toast.error("Failed to copy to clipboard");
    }
  };

  const integrationHealth = useMemo(() => {
    return {
      geminiReady: Boolean(formData.geminiApiKey),
      smtpReady: Boolean(formData.smtpUser && formData.smtpPass),
      smtpHostConfigured: Boolean(formData.smtpHost),
    };
  }, [formData]);

  const formatTimestamp = (value?: string) => {
    if (!value) return "Never";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown";
    return date.toLocaleString();
  };

  const renderStatusBadge = (isReady: boolean, label: string) => (
    <Badge variant={isReady ? "default" : "secondary"} className="flex items-center gap-2 px-3 py-1">
      {isReady ? (
        <CheckCircle2 className="w-4 h-4" />
      ) : (
        <XCircle className="w-4 h-4" />
      )}
      {label}
    </Badge>
  );

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-6xl mx-auto space-y-8"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <h1 className="text-3xl font-display font-bold">Account & Integrations</h1>
              <p className="text-muted-foreground">
                Manage your profile information, Gemini API access and SMTP credentials in one place.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={showSecrets} onCheckedChange={setShowSecrets} id="toggle-secrets" />
              <Label htmlFor="toggle-secrets" className="text-sm text-muted-foreground">
                {showSecrets ? "Hide" : "Reveal"} secrets
              </Label>
            </div>
          </div>

          {/* User Profile Summary */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="shadow-elegant">
              <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                    Profile overview
                  </CardTitle>
                  <CardDescription>
                    {user?.name ? `Signed in as ${user.name}` : "Signed in"} — {user?.email}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {renderStatusBadge(integrationHealth.geminiReady, "Gemini key")}
                  {renderStatusBadge(integrationHealth.smtpReady, "SMTP login")}
                  {renderStatusBadge(integrationHealth.smtpHostConfigured, "SMTP host")}
                </div>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground tracking-wide">Account email</p>
                    <p className="text-base font-medium">{user?.email}</p>
                    <Button
                      variant="link"
                      className="px-0"
                      onClick={() => user?.email && copyToClipboard(user.email, "Email")}
                    >
                      <Copy className="w-4 h-4 mr-2" /> Copy email
                    </Button>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground tracking-wide">User ID</p>
                    <p className="text-base font-mono break-all text-muted-foreground">{user?.id}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground tracking-wide">Settings last updated</p>
                    <p className="text-base font-medium">{formatTimestamp(formData.updatedAt)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      onClick={handleResetToDefaults}
                      className="flex items-center justify-center gap-2"
                    >
                      <Undo2 className="w-4 h-4" /> Defaults
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleClearSecrets}
                      className="flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" /> Clear secrets
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <div className="grid grid-cols-1 xl:grid-cols-[2fr,1fr] gap-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <Card className="shadow-elegant">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <KeyRound className="w-5 h-5 text-primary" />
                    Gemini API
                  </CardTitle>
                  <CardDescription>
                    Provide your Google Gemini key to generate tailored motivation letters.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="space-y-6" onSubmit={handleSave}>
                    <div className="space-y-2">
                      <Label htmlFor="geminiApiKey">Gemini API key</Label>
                      <div className="relative">
                        <Input
                          id="geminiApiKey"
                          type={showSecrets ? "text" : "password"}
                          placeholder="AIza..."
                          value={formData.geminiApiKey}
                          onChange={(event) => handleChange("geminiApiKey", event.target.value)}
                          autoComplete="off"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-2 top-1/2 -translate-y-1/2"
                          onClick={() => setShowSecrets((prev) => !prev)}
                        >
                          {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        You can create a key in Google AI Studio. Make sure the Gemini 1.5 Flash model is enabled.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="geminiModel">Preferred model</Label>
                      <Input
                        id="geminiModel"
                        value={formData.geminiModel}
                        onChange={(event) => handleChange("geminiModel", event.target.value)}
                        placeholder="gemini-1.5-flash"
                      />
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label htmlFor="smtpUser">SMTP user</Label>
                      <Input
                        id="smtpUser"
                        type="email"
                        placeholder="your-email@gmail.com"
                        value={formData.smtpUser}
                        onChange={(event) => handleChange("smtpUser", event.target.value)}
                        autoComplete="off"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="smtpPass">SMTP password or App password</Label>
                      <div className="relative">
                        <Input
                          id="smtpPass"
                          type={showSecrets ? "text" : "password"}
                          placeholder="••••••••"
                          value={formData.smtpPass}
                          onChange={(event) => handleChange("smtpPass", event.target.value)}
                          autoComplete="new-password"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-2 top-1/2 -translate-y-1/2"
                          onClick={() => setShowSecrets((prev) => !prev)}
                        >
                          {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        For Gmail, use an App Password with 2FA enabled. We store it encrypted with AES-256.
                      </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="smtpHost">SMTP host</Label>
                        <Input
                          id="smtpHost"
                          value={formData.smtpHost}
                          onChange={(event) => handleChange("smtpHost", event.target.value)}
                          placeholder="smtp.gmail.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="smtpPort">Port</Label>
                        <Input
                          id="smtpPort"
                          value={formData.smtpPort}
                          onChange={(event) => handleChange("smtpPort", event.target.value)}
                          placeholder="465"
                          inputMode="numeric"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4">
                      <div className="text-xs text-muted-foreground">
                        Updates are encrypted at rest and scoped to your user only.
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={fetchSettings}
                          disabled={isLoading}
                          className="flex items-center gap-2"
                        >
                          <RefreshCw className={isLoading ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
                          Reload
                        </Button>
                        <Button
                          type="submit"
                          disabled={!hasChanges || isSaving}
                          className="flex items-center gap-2"
                        >
                          {isSaving ? (
                            <LoadingSpinner className="w-4 h-4" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                          Save changes
                        </Button>
                      </div>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="space-y-6"
            >
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <MailCheck className="w-5 h-5 text-primary" />
                    Integration health
                  </CardTitle>
                  <CardDescription>Quick status of required credentials.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-medium">Gemini API key</p>
                      <p className="text-sm text-muted-foreground">
                        Required for automatic letter generation.
                      </p>
                    </div>
                    {renderStatusBadge(integrationHealth.geminiReady, integrationHealth.geminiReady ? "Ready" : "Missing")}
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-medium">SMTP credentials</p>
                      <p className="text-sm text-muted-foreground">
                        Needed to send personalized emails.
                      </p>
                    </div>
                    {renderStatusBadge(integrationHealth.smtpReady, integrationHealth.smtpReady ? "Ready" : "Incomplete")}
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-medium">SMTP host & port</p>
                      <p className="text-sm text-muted-foreground">Ensure the provider allows secure access.</p>
                    </div>
                    {renderStatusBadge(integrationHealth.smtpHostConfigured, "Configured")}
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Need a Gemini key?</CardTitle>
                  <CardDescription>Follow the official guide (opens in a new tab).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button
                    asChild
                    variant="outline"
                    className="w-full justify-center gap-2"
                  >
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open Google AI Studio
                    </a>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="w-full justify-center gap-2"
                  >
                    <a
                      href="https://support.google.com/mail/answer/185833?hl=en"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Create Gmail app password
                    </a>
                  </Button>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Quick actions</CardTitle>
                  <CardDescription>Jump back into your workflow.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <Button asChild variant="secondary" className="justify-start">
                    <Link to="/generate">Generate new letters</Link>
                  </Button>
                  <Button asChild variant="secondary" className="justify-start">
                    <Link to="/send-emails">Send follow-up emails</Link>
                  </Button>
                  <Button asChild variant="secondary" className="justify-start">
                    <Link to="/documents">Manage uploaded documents</Link>
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {isLoading && (
        <div className="fixed inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="p-6 rounded-xl border bg-card shadow-lg flex flex-col items-center gap-3">
            <LoadingSpinner size="lg" />
            <p className="text-sm text-muted-foreground">Loading your settings…</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
