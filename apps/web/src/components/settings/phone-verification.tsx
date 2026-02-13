"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { T, useGT } from "gt-next";
import { CheckCircle, Loader2, Phone, Unlink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const COUNTRY_CODES = [
  { value: "55", label: "BR +55" },
  { value: "1", label: "US +1" },
  { value: "44", label: "UK +44" },
  { value: "351", label: "PT +351" },
  { value: "34", label: "ES +34" },
  { value: "49", label: "DE +49" },
  { value: "33", label: "FR +33" },
  { value: "39", label: "IT +39" },
  { value: "81", label: "JP +81" },
  { value: "86", label: "CN +86" },
  { value: "91", label: "IN +91" },
  { value: "61", label: "AU +61" },
  { value: "52", label: "MX +52" },
  { value: "54", label: "AR +54" },
  { value: "57", label: "CO +57" },
] as const;

export function PhoneVerification() {
  const t = useGT();
  const user = useQuery(api.users.getCurrentUser);
  const pendingVerification = useQuery(api.phoneVerification.getVerificationStatus, {});

  const requestVerification = useMutation(api.phoneVerification.requestVerification);
  const confirmVerification = useMutation(api.phoneVerification.confirmVerification);
  const unlinkPhone = useMutation(api.phoneVerification.unlinkPhone);

  const [countryCode, setCountryCode] = useState("55");
  const [localNumber, setLocalNumber] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const phone = user?.phone;
  const isPending = pendingVerification !== null && pendingVerification !== undefined;

  async function handleSendCode() {
    const digits = localNumber.replace(/\D/g, "");
    if (!digits) {
      toast.error(t("Enter a valid phone number"));
      return;
    }

    const fullPhone = countryCode + digits;
    setLoading(true);
    try {
      const result = await requestVerification({ phone: fullPhone });
      if (result.success) {
        toast.success(t("Verification code sent via WhatsApp"));
      } else {
        toast.error(result.error ?? t("Failed to send code"));
      }
    } catch {
      toast.error(t("Failed to send verification code"));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (code.length !== 6) {
      toast.error(t("Enter the 6-digit code"));
      return;
    }

    setLoading(true);
    try {
      const result = await confirmVerification({ code });
      if (result.success) {
        toast.success(t("Phone verified successfully"));
        setCode("");
        setLocalNumber("");
      } else {
        toast.error(result.error ?? t("Verification failed"));
      }
    } catch {
      toast.error(t("Failed to verify code"));
    } finally {
      setLoading(false);
    }
  }

  async function handleUnlink() {
    setLoading(true);
    try {
      await unlinkPhone({});
      toast.success(t("Phone unlinked"));
    } catch {
      toast.error(t("Failed to unlink phone"));
    } finally {
      setLoading(false);
    }
  }

  // State 3: Phone already linked
  if (phone) {
    return (
      <div className="rounded-lg border p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <CheckCircle className="size-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium">
              <T>WhatsApp linked</T>
            </h3>
            <p className="text-muted-foreground text-xs">+{phone}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleUnlink} disabled={loading}>
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Unlink className="size-3.5" />
            )}
            <T>Unlink</T>
          </Button>
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          <T>Your WhatsApp conversations appear in the sidebar.</T>
        </p>
      </div>
    );
  }

  // State 2: Code sent, waiting for verification
  if (isPending) {
    return (
      <div className="rounded-lg border p-4">
        <div className="mb-4 flex items-center gap-3">
          <div className="bg-muted flex size-8 items-center justify-center rounded-full">
            <Phone className="text-muted-foreground size-4" />
          </div>
          <div>
            <h3 className="text-sm font-medium">
              <T>Verify your phone</T>
            </h3>
            <p className="text-muted-foreground text-xs">
              {t("Code sent to {phone}", { phone: `+${pendingVerification.phone}` })}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <Label htmlFor="code" className="text-xs">
              <T>Verification code</T>
            </Label>
            <Input
              id="code"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              className="mt-1.5 font-mono tracking-widest"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleVerify} disabled={loading || code.length !== 6} size="sm">
              {loading && <Loader2 className="size-3.5 animate-spin" />}
              <T>Verify</T>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSendCode} disabled={loading}>
              <T>Resend code</T>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // State 1: No phone linked — enter phone
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-4 flex items-center gap-3">
        <div className="bg-muted flex size-8 items-center justify-center rounded-full">
          <Phone className="text-muted-foreground size-4" />
        </div>
        <div>
          <h3 className="text-sm font-medium">
            <T>Link WhatsApp</T>
          </h3>
          <p className="text-muted-foreground text-xs">
            <T>Verify your phone to see WhatsApp conversations here.</T>
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <Label className="text-xs">
            <T>Phone number</T>
          </Label>
          <div className="mt-1.5 flex gap-2">
            <Select value={countryCode} onValueChange={setCountryCode}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRY_CODES.map((cc) => (
                  <SelectItem key={cc.value} value={cc.value}>
                    {cc.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="11999998888"
              value={localNumber}
              onChange={(e) => setLocalNumber(e.target.value.replace(/\D/g, ""))}
              className="flex-1"
            />
          </div>
        </div>
        <Button
          onClick={handleSendCode}
          disabled={loading || !localNumber.trim()}
          size="sm"
          className="w-fit"
        >
          {loading && <Loader2 className="size-3.5 animate-spin" />}
          <T>Send code</T>
        </Button>
      </div>
    </div>
  );
}
