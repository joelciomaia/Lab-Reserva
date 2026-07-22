import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { FormField } from '../FormField';
import controlStyles from '../FormField/Control.module.css';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  labelHidden?: boolean | undefined;
  containerClassName?: string | undefined;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    id,
    label,
    hint,
    error,
    required = false,
    labelHidden = false,
    className,
    containerClassName,
    type = 'text',
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    ...inputProps
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy =
    [ariaDescribedBy, hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;
  const inputClasses = [controlStyles.control, error && controlStyles.hasError, className]
    .filter(Boolean)
    .join(' ');

  return (
    <FormField
      id={inputId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      labelHidden={labelHidden}
      className={containerClassName}
      hintId={hintId}
      errorId={errorId}
    >
      <input
        {...inputProps}
        ref={ref}
        id={inputId}
        type={type}
        className={inputClasses}
        required={required}
        aria-describedby={describedBy}
        aria-invalid={error ? true : ariaInvalid}
      />
    </FormField>
  );
});
