export function textValue(form: FormData, name: string, max: number) {
  const value = form.get(name);
  return typeof value === 'string' && value.length <= max ? value.trim() : '';
}
export function captchaOptions(form: FormData, enabled: boolean) {
  const captchaToken = textValue(form, 'cf-turnstile-response', 2048);
  return enabled ? { captchaToken } : {};
}
