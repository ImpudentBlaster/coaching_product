import { Children, isValidElement, useLayoutEffect, useRef, useState, type ReactNode, type SelectHTMLAttributes, type InputHTMLAttributes, type ChangeEvent } from 'react';
import { Select, SelectValue, Button, Popover, ListBox, ListBoxItem, DatePicker, Group, DateInput, DateSegment, Dialog, Calendar, CalendarGrid, CalendarCell, Heading, FieldError, ComboBox, Input } from 'react-aria-components';
import { parseDate } from '@internationalized/date';
import { I18nProvider } from 'react-aria-components';
import './form-controls.css';

// Keep the existing screens' string values and HTML form submission contracts.
function useFieldsetDisabled() {
  const ref = useRef<HTMLDivElement>(null);
  const [fieldsetDisabled, setFieldsetDisabled] = useState(false);
  const [portalContainer,setPortalContainer] = useState<HTMLElement>();
  useLayoutEffect(() => {
    const root = ref.current;
    setPortalContainer(root?.closest('dialog') ?? undefined);
    const update = () => setFieldsetDisabled(!!root?.closest('fieldset:disabled'));
    update();
    const observer = new MutationObserver(update);
    if (root?.parentElement) observer.observe(root.closest('form') ?? root.parentElement, { attributes: true, attributeFilter: ['disabled'], subtree: true });
    return () => observer.disconnect();
  }, []);
  return { ref, fieldsetDisabled, portalContainer };
}
function optionText(children: ReactNode): string {
  return Children.toArray(children).map(child => isValidElement<{children?: ReactNode}>(child) ? optionText(child.props.children) : String(child)).join('');
}
type Option = { value: string; label: ReactNode; disabled: boolean };
function optionsFrom(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(child)) return [];
    if (child.type === 'option') return [{ value: String(child.props.value ?? optionText(child.props.children)), label: child.props.children, disabled: !!child.props.disabled }];
    return optionsFrom(child.props.children);
  });
}
export function SelectControl({ children, value, defaultValue, onChange, name, required, disabled, className, id, 'aria-label': label }: SelectHTMLAttributes<HTMLSelectElement> & { 'aria-label': string }) {
  const { ref, fieldsetDisabled, portalContainer } = useFieldsetDisabled();
  const options = optionsFrom(children);
  const selected = value === undefined ? undefined : String(value);
  const initial = String(defaultValue ?? options[0]?.value ?? '');
  return <div ref={ref} className={`form-control ${className ?? ''}`}><Select aria-label={label} {...(id ? { id } : {})} {...(name ? { name } : {})} isRequired={required ?? false} isDisabled={disabled || fieldsetDisabled} disabledKeys={options.filter(option => option.disabled).map(option => option.value)} validationBehavior="native"
    {...(selected === undefined ? { defaultSelectedKey: initial } : { selectedKey: selected })}
    onSelectionChange={key => onChange?.({ target: { value: String(key ?? '') }, currentTarget: { value: String(key ?? '') } } as ChangeEvent<HTMLSelectElement>)}>
    <Button className="picker-trigger"><SelectValue /><span aria-hidden="true">⌄</span></Button>
    <Popover {...(portalContainer ? { UNSTABLE_portalContainer: portalContainer } : {})} className="picker-popover"><ListBox className="picker-options">{options.map(option => <ListBoxItem className="picker-option" key={option.value} id={option.value} textValue={optionText(option.label)}>{option.label}</ListBoxItem>)}</ListBox></Popover>
    <FieldError className="picker-error" />
  </Select></div>;
}
function dateValue(value: InputHTMLAttributes<HTMLInputElement>['value']) {
  return typeof value === 'string' && value ? parseDate(value) : null;
}
export function SuggestionControl({ options, name, required, maxLength, placeholder, 'aria-label': label }: { options: string[]; name: string; required?: boolean; maxLength?: number; placeholder?: string; 'aria-label': string }) {
  const { ref, fieldsetDisabled, portalContainer } = useFieldsetDisabled();
  return <div ref={ref} className="form-control"><ComboBox aria-label={label} name={name} allowsCustomValue formValue="text" isRequired={required ?? false} isDisabled={fieldsetDisabled} validationBehavior="native">
    <Group className="picker-trigger picker-suggestion"><Input {...(maxLength ? { maxLength } : {})} {...(placeholder ? { placeholder } : {})} /><Button aria-label={`Show ${label.toLowerCase()} suggestions`}>⌄</Button></Group>
    <Popover {...(portalContainer ? { UNSTABLE_portalContainer: portalContainer } : {})} className="picker-popover"><ListBox className="picker-options" renderEmptyState={() => 'Type a custom value'}>{options.map(option => <ListBoxItem className="picker-option" key={option} id={option} textValue={option}>{option}</ListBoxItem>)}</ListBox></Popover>
    <FieldError className="picker-error" />
  </ComboBox></div>;
}
export function DateControl({ value, defaultValue, onChange, name, required, disabled, min, max, className, id, 'aria-label': label }: InputHTMLAttributes<HTMLInputElement> & { 'aria-label': string }) {
  const { ref, fieldsetDisabled, portalContainer } = useFieldsetDisabled();
  return <I18nProvider locale="en-GB"><div ref={ref} className={`form-control ${className ?? ''}`}><DatePicker aria-label={label} {...(id ? { id } : {})} {...(name ? { name } : {})} isRequired={required ?? false} isDisabled={disabled || fieldsetDisabled} validationBehavior="native"
    {...(value === undefined ? { defaultValue: dateValue(defaultValue) } : { value: dateValue(value) })}
    {...(min ? { minValue: parseDate(String(min)) } : {})} {...(max ? { maxValue: parseDate(String(max)) } : {})}
    onChange={date => onChange?.({ target: { value: date?.toString() ?? '' }, currentTarget: { value: date?.toString() ?? '' } } as ChangeEvent<HTMLInputElement>)}>
    <Group className="picker-trigger"><DateInput className="picker-date-input">{segment => <DateSegment className="picker-segment" segment={segment}>{segment.type === 'literal' ? '-' : segment.isPlaceholder ? ({ day: 'DD', month: 'MM', year: 'YYYY' }[segment.type as 'day' | 'month' | 'year'] ?? segment.text) : ['day', 'month'].includes(segment.type) ? segment.text.padStart(2, '0') : segment.text}</DateSegment>}</DateInput><Button className="picker-calendar-button" aria-label="Open calendar">▦</Button></Group>
    <Popover {...(portalContainer ? { UNSTABLE_portalContainer: portalContainer } : {})} className="picker-popover picker-calendar-popover"><Dialog><Calendar><header className="picker-calendar-header"><Button slot="previous" aria-label="Previous month">‹</Button><Heading /><Button slot="next" aria-label="Next month">›</Button></header><CalendarGrid>{date => <CalendarCell className="picker-day" date={date} />}</CalendarGrid></Calendar></Dialog></Popover>
    <FieldError className="picker-error" />
  </DatePicker></div></I18nProvider>;
}
