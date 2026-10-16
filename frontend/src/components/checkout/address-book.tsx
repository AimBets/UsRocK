"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Check, LoaderCircle, MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { createAddress, deleteAddress, listAddresses, updateAddress } from "@/lib/api/checkout";
import { checkoutError, digits } from "@/lib/checkout-state";
import type { Address, AddressInput } from "@/types/checkout";

const STATES = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

export function AddressBook({ selectable = false, selectedId, onSelect }: { selectable?: boolean; selectedId?: string; onSelect?: (address: Address) => void }) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listAddresses();
      setAddresses(result.data);
      const preferred = result.data.find((address) => address.id === selectedId) ?? result.data.find((address) => address.isDefault) ?? result.data[0];
      if (selectable && preferred) onSelect?.(preferred);
    } catch (cause) {
      setError(checkoutError(cause));
    } finally {
      setLoading(false);
    }
  }, [onSelect, selectable, selectedId]);

  useEffect(() => {
    let active = true;
    void listAddresses().then((result) => {
      if (!active) return;
      setAddresses(result.data);
      const preferred = result.data.find((item) => item.id === selectedId) ?? result.data.find((item) => item.isDefault) ?? result.data[0];
      if (selectable && preferred) onSelect?.(preferred);
    }).catch((cause) => { if (active) setError(checkoutError(cause)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [onSelect, selectable, selectedId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSaving(true);
    setError("");
    const data = new FormData(form);
    const input: AddressInput = {
      label: String(data.get("label") || "").trim() || null,
      recipientName: String(data.get("recipientName") || ""),
      recipientDocument: digits(String(data.get("recipientDocument") || ""), 11),
      recipientPhone: digits(String(data.get("recipientPhone") || ""), 13),
      postalCode: digits(String(data.get("postalCode") || ""), 8),
      street: String(data.get("street") || ""), number: String(data.get("number") || ""),
      complement: String(data.get("complement") || "").trim() || null,
      district: String(data.get("district") || ""), city: String(data.get("city") || ""),
      state: String(data.get("state") || ""), isDefault: data.get("isDefault") === "on",
    };
    try {
      const saved = editing
        ? await updateAddress(editing.id, {
            label: input.label,
            recipientName: input.recipientName,
            ...(input.recipientDocument ? { recipientDocument: input.recipientDocument } : {}),
            ...(input.recipientPhone ? { recipientPhone: input.recipientPhone } : {}),
            postalCode: input.postalCode,
            street: input.street,
            number: input.number,
            complement: input.complement,
            district: input.district,
            city: input.city,
            state: input.state,
            isDefault: input.isDefault,
          })
        : await createAddress(input);
      setShowForm(false);
      setEditing(null);
      form.reset();
      await load();
      onSelect?.(saved);
    } catch (cause) {
      setError(checkoutError(cause));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remover este endereço da sua conta? Pedidos já feitos não serão alterados.")) return;
    setSaving(true);
    try { await deleteAddress(id); await load(); } catch (cause) { setError(checkoutError(cause)); } finally { setSaving(false); }
  }

  async function makeDefault(id: string) {
    setSaving(true);
    try { await updateAddress(id, { isDefault: true }); await load(); } catch (cause) { setError(checkoutError(cause)); } finally { setSaving(false); }
  }

  function openNewAddress() {
    setEditing(null);
    setShowForm(true);
    setError("");
  }

  function openEditAddress(address: Address) {
    setEditing(address);
    setShowForm(true);
    setError("");
  }

  function closeForm() {
    setEditing(null);
    setShowForm(false);
  }

  return <div className="address-book">
    <div className="checkout-section-heading"><div><p className="eyebrow">Entrega</p><h2>Endereço</h2></div><button className="button-ghost" onClick={showForm && !editing ? closeForm : openNewAddress} type="button"><Plus size={16} /> {showForm && !editing ? "Fechar formulário" : "Novo endereço"}</button></div>
    {loading && <p className="checkout-state" role="status"><LoaderCircle className="animate-spin" size={18} /> Carregando endereços…</p>}
    {error && <p className="auth-error" role="alert">{error}</p>}
    {!loading && !addresses.length && !showForm && <button className="address-empty" onClick={openNewAddress} type="button"><MapPin size={28} /><strong>Cadastre onde quer receber</strong><span>Você pode salvar até 10 endereços.</span></button>}
    <div className="address-list">
      {addresses.map((address) => <article className={`address-card ${selectedId === address.id ? "is-selected" : ""}`} key={address.id}>
        <button className="address-select" disabled={!selectable} onClick={() => onSelect?.(address)} type="button">
          <span className="address-card-top"><strong>{address.label || "Endereço"}</strong>{address.isDefault && <span><Star size={12} /> Padrão</span>}</span>
          <span>{address.recipientName}</span><span>{address.street}, {address.number}{address.complement ? ` — ${address.complement}` : ""}</span>
          <span>{address.district} · {address.city}/{address.state} · CEP {address.postalCode.replace(/(\d{5})(\d{3})/, "$1-$2")}</span>
          <span>{address.recipientDocumentMasked} · {address.recipientPhoneMasked}</span>
          {selectedId === address.id && <Check className="address-check" size={18} aria-label="Selecionado" />}
        </button>
        <div className="address-actions"><button disabled={saving} onClick={() => openEditAddress(address)} type="button"><Pencil size={13} /> Editar</button>{!address.isDefault && <button disabled={saving} onClick={() => void makeDefault(address.id)} type="button">Tornar padrão</button>}<button disabled={saving} onClick={() => void remove(address.id)} type="button"><Trash2 size={13} /> Remover</button></div>
      </article>)}
    </div>
    {showForm && <form className="address-form" key={editing?.id ?? "new-address"} onSubmit={submit}>
      <p className="checkout-form-note">O backend valida CPF, CEP e telefone. Não há consulta de CEP disponível no contrato atual, então o endereço deve ser preenchido manualmente.{editing ? " CPF e telefone ficam vazios porque a API só devolve esses dados mascarados; preencha apenas se quiser alterá-los." : ""}</p>
      <label><span>Apelido</span><input defaultValue={editing?.label ?? ""} maxLength={40} name="label" placeholder="Casa" /></label>
      <label className="span-2"><span>Nome de quem recebe</span><input autoComplete="name" defaultValue={editing?.recipientName ?? ""} maxLength={120} minLength={3} name="recipientName" required /></label>
      <label><span>{editing ? "Novo CPF (opcional)" : "CPF"}</span><input inputMode="numeric" maxLength={14} name="recipientDocument" placeholder={editing ? editing.recipientDocumentMasked : "000.000.000-00"} required={!editing} /></label>
      <label><span>{editing ? "Novo telefone (opcional)" : "Telefone"}</span><input autoComplete="tel" inputMode="tel" maxLength={15} name="recipientPhone" placeholder={editing?.recipientPhoneMasked} required={!editing} /></label>
      <label><span>CEP</span><input autoComplete="postal-code" defaultValue={editing?.postalCode ?? ""} inputMode="numeric" maxLength={9} name="postalCode" placeholder="00000-000" required /></label>
      <label className="span-2"><span>Rua</span><input autoComplete="address-line1" defaultValue={editing?.street ?? ""} maxLength={200} minLength={2} name="street" required /></label>
      <label><span>Número</span><input defaultValue={editing?.number ?? ""} maxLength={20} name="number" placeholder="S/N" required /></label>
      <label><span>Complemento</span><input autoComplete="address-line2" defaultValue={editing?.complement ?? ""} maxLength={100} name="complement" /></label>
      <label><span>Bairro</span><input defaultValue={editing?.district ?? ""} maxLength={100} minLength={2} name="district" required /></label>
      <label><span>Cidade</span><input autoComplete="address-level2" defaultValue={editing?.city ?? ""} maxLength={100} minLength={2} name="city" required /></label>
      <label><span>UF</span><select autoComplete="address-level1" defaultValue={editing?.state ?? ""} name="state" required><option value="">Selecione</option>{STATES.map((state) => <option key={state}>{state}</option>)}</select></label>
      <label className="checkout-check span-2"><input defaultChecked={editing?.isDefault ?? false} name="isDefault" type="checkbox" /><span>Usar como endereço padrão</span></label>
      <div className="address-form-actions span-2"><button className="button-ghost" onClick={closeForm} type="button">Cancelar</button><button className="button-primary" disabled={saving} type="submit">{saving ? <><LoaderCircle className="animate-spin" size={16} /> Salvando…</> : editing ? "Salvar alterações" : "Salvar endereço"}</button></div>
    </form>}
  </div>;
}

