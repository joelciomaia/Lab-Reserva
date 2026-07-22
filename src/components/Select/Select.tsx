import { forwardRef, useId } from 'react';
import type { ReactNode, SelectHTMLAttributes } from 'react';
import { FormField } from '../FormField';
import controlStyles from '../FormField/Control.module.css';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  labelHidden?: boolean | undefined;
  containerClassName?: string | undefined;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    id,
    label,
    hint,
    error,
    required = false,
    labelHidden = false,
    className,
    containerClassName,
    children,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    ...selectProps
  },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const hintId = `${selectId}-hint`;
  const errorId = `${selectId}-error`;
  const describedBy =
    [ariaDescribedBy, hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;
  const selectClasses = [
    controlStyles.control,
    controlStyles.select,
    error && controlStyles.hasError,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <FormField
      id={selectId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      labelHidden={labelHidden}
      className={containerClassName}
      hintId={hintId}
      errorId={errorId}
    >
      <span className={controlStyles.selectContainer}>
        <select
          {...selectProps}
          ref={ref}
          id={selectId}
          className={selectClasses}
          required={required}
          aria-describedby={describedBy}
          aria-invalid={error ? true : ariaInvalid}
        >
          {children}
        </select>
      </span>
    </FormField>
  );
});
