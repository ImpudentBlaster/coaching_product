import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiRequest, type Program } from '../../lib/api';

type Schedule = {
  formId: string;
  startDate: string;
  frequency: 'ONCE' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  occurrences: number;
  weekdays: number[];
};
type Membership = {
  name: string;
  status: 'PENDING' | 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'EXPIRED';
  startsOn: string;
  endsOn: string | null;
  notes: string;
};
type Setup = {
  firstName: string;
  lastName: string;
  email: string;
  birthDate: string | null;
  phone: string;
  weightUnit: 'KG' | 'LB';
  exerciseUnit: 'KG' | 'LB';
  programId: string | null;
  nutritionPlanId: string | null;
  membership: Membership | null;
  checkin: Schedule | null;
};
type Option = { id: string; name: string };
const steps = [
  ['Personal information', 'Set up client personal information'],
  ['Assign plan', 'Choose membership, nutrition and workout plans'],
  ['Assign form', 'Choose a check-in form and schedule'],
  ['Review and submit', 'Review the details before saving'],
];
const weekdays = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const empty: Setup = {
  firstName: '',
  lastName: '',
  email: '',
  birthDate: null,
  phone: '',
  weightUnit: 'KG',
  exerciseUnit: 'KG',
  programId: null,
  nutritionPlanId: null,
  membership: null,
  checkin: null,
};
export function ClientWizard({
  clientId,
  invitationId,
  onClose,
  onSaved,
}: {
  clientId?: string;
  invitationId?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const editing = !!(clientId || invitationId);
  const resource = invitationId ? `invitations/${invitationId}` : clientId;
  const [data, setData] = useState<Setup>(empty);
  const [revision, setRevision] = useState(0);
  const [step, setStep] = useState(0);
  const [programs, setPrograms] = useState<Option[]>([]);
  const [nutrition, setNutrition] = useState<Option[]>([]);
  const [forms, setForms] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  async function load() {
    setLoading(true);
    setError('');
    try {
      const [p, n, f, s] = await Promise.all([
        apiRequest<{ programs: Program[] }>('/coach/programs'),
        apiRequest<{
          entries: Array<{
            id: string;
            kind: string;
            data: { name: string; kind: string };
            archivedAt?: string | null;
          }>;
        }>('/coach/nutrition-library'),
        apiRequest<{
          forms: Array<{ id: string; definition: { name: string } }>;
        }>('/coach/checkins/forms'),
        editing
          ? apiRequest<{ data: Setup; revision: number }>(
              `/coach/client-setup/${resource}`,
            )
          : Promise.resolve(null),
      ]);
      setPrograms(
        p.programs
          .filter((item) => item.status === 'PUBLISHED')
          .map((item) => ({ id: item.id, name: item.name })),
      );
      setNutrition(
        n.entries
          .filter((item) => item.data.kind === 'plans' && !item.archivedAt)
          .map((item) => ({ id: item.id, name: item.data.name })),
      );
      setForms(
        f.forms.map((item) => ({ id: item.id, name: item.definition.name })),
      );
      if (s) {
        setData(s.data);
        setRevision(s.revision);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to load client setup.',
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [clientId, invitationId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  useEffect(() => {
    if (!dirty || saved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, saved]);
  function update(patch: Partial<Setup>) {
    setError('');
    setDirty(true);
    setData((current) => ({ ...current, ...patch }));
  }
  function close() {
    if (
      !busy &&
      (!dirty ||
        saved ||
        window.confirm('Discard your unsaved client details?'))
    )
      onClose();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (editing)
        await apiRequest(`/coach/client-setup/${resource}`, {
          method: 'PUT',
          body: JSON.stringify({ data, revision }),
        });
      else {
        const result = await apiRequest<{ invitation: { token: string } }>(
          '/coach/client-setup',
          { method: 'POST', body: JSON.stringify(data) },
        );
        setLink(
          `${window.location.origin}/register/client?invite=${encodeURIComponent(result.invitation.token)}`,
        );
      }
      setSaved(true);
      setDirty(false);
      await onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to save client.',
      );
    } finally {
      setBusy(false);
    }
  }
  const name = (options: Option[], id: string | null) =>
    id
      ? (options.find((option) => option.id === id)?.name ??
        'Previously assigned plan')
      : 'None';
  function select(
    label: string,
    value: string | null,
    options: Option[],
    change: (id: string | null) => void,
  ) {
    return (
      <label>
        {label}
        <select
          value={value ?? ''}
          onChange={(event) => change(event.target.value || null)}
        >
          <option value="">None</option>
          {value && !options.some((option) => option.id === value) && (
            <option value={value}>
              Previously assigned plan (choose an available plan)
            </option>
          )}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <section className="client-setup-page">
      <header className="dashboard-head">
        <div>
          <p className="eyebrow">Client setup</p>
          <h1>{editing ? 'Update client' : 'Add client'}</h1>
        </div>
        <button className="secondary" disabled={busy} onClick={close}>
          {saved ? 'Back to clients' : 'Cancel'}
        </button>
      </header>
      <div className="client-wizard">
        <nav className="client-wizard-steps" aria-label="Client setup steps">
          {steps.map(([title, description], index) => (
            <button
              key={title}
              type="button"
              className={
                index === step ? 'current' : index < step ? 'complete' : ''
              }
              aria-current={index === step ? 'step' : undefined}
              disabled={busy || loading || saved || index > step}
              onClick={() => setStep(index)}
            >
              <span className="wizard-step-number">
                {index < step ? '✓' : index + 1}
              </span>
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
            </button>
          ))}
        </nav>
        <div className="client-wizard-content">
          {loading ? (
            <p role="status">Loading client setup…</p>
          ) : saved ? (
            <div className="wizard-success">
              <span className="wizard-success-icon">✓</span>
              <h2>{editing ? 'Client updated' : 'Invitation ready'}</h2>
              <p>
                {editing
                  ? 'The client details and selected assignments have been saved.'
                  : 'Share this private link with the client. They will choose their own password, then appear in your pending clients for approval.'}
              </p>
              {link && (
                <label>
                  Registration link
                  <input
                    readOnly
                    value={link}
                    onFocus={(event) => event.target.select()}
                  />
                  <small>
                    Valid for seven days. This link is shown only here.
                  </small>
                </label>
              )}
              <button className="primary" onClick={onClose}>
                Back to clients
              </button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <h2 ref={heading} tabIndex={-1}>
                {step === 0
                  ? 'Enter client personal information'
                  : steps[step]![0]}
              </h2>
              {error && (
                <div role="alert" className="error">
                  {error}
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void load()}
                  >
                    Reload setup
                  </button>
                </div>
              )}
              <fieldset disabled={busy} className="wizard-fields">
                {step === 0 && (
                  <>
                    <label>
                      First name
                      <input
                        autoComplete="given-name"
                        required
                        maxLength={48}
                        value={data.firstName}
                        onChange={(event) =>
                          update({ firstName: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Last name
                      <input
                        autoComplete="family-name"
                        required
                        maxLength={48}
                        value={data.lastName}
                        onChange={(event) =>
                          update({ lastName: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Email
                      <input
                        type="email"
                        autoComplete="email"
                        required
                        readOnly={!!clientId}
                        value={data.email}
                        onChange={(event) =>
                          update({ email: event.target.value })
                        }
                      />
                      {clientId && (
                        <small>Account email is managed separately.</small>
                      )}
                    </label>
                    <label>
                      Date of birth
                      <input
                        type="date"
                        max={today()}
                        value={data.birthDate ?? ''}
                        onChange={(event) =>
                          update({ birthDate: event.target.value || null })
                        }
                      />
                    </label>
                    <label>
                      Phone
                      <input
                        type="tel"
                        autoComplete="tel"
                        maxLength={40}
                        value={data.phone}
                        onChange={(event) =>
                          update({ phone: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Weight measurement
                      <select
                        value={data.weightUnit}
                        onChange={(event) =>
                          update({
                            weightUnit: event.target.value as 'KG' | 'LB',
                          })
                        }
                      >
                        <option value="KG">KG</option>
                        <option value="LB">LB</option>
                      </select>
                      <small>
                        Preferred unit for the client record. Existing
                        measurement fields retain their displayed units.
                      </small>
                    </label>
                  </>
                )}
                {step === 1 && (
                  <>
                    <label className="wizard-toggle">
                      <input
                        type="checkbox"
                        checked={!!data.membership}
                        onChange={(event) =>
                          update({
                            membership: event.target.checked
                              ? {
                                  name: '',
                                  status: 'PENDING',
                                  startsOn: today(),
                                  endsOn: null,
                                  notes: '',
                                }
                              : null,
                          })
                        }
                      />
                      Record a membership
                    </label>
                    {data.membership && (
                      <>
                        <label>
                          Membership / package name
                          <input
                            required
                            minLength={2}
                            maxLength={150}
                            value={data.membership.name}
                            onChange={(event) =>
                              update({
                                membership: {
                                  ...data.membership!,
                                  name: event.target.value,
                                },
                              })
                            }
                          />
                        </label>
                        <label>
                          Membership status
                          <select
                            value={data.membership.status}
                            onChange={(event) =>
                              update({
                                membership: {
                                  ...data.membership!,
                                  status: event.target
                                    .value as Membership['status'],
                                },
                              })
                            }
                          >
                            {[
                              'PENDING',
                              'ACTIVE',
                              'PAUSED',
                              'CANCELLED',
                              'EXPIRED',
                            ].map((status) => (
                              <option key={status}>{status}</option>
                            ))}
                          </select>
                        </label>
                        <div className="form-row">
                          <label>
                            Start date
                            <input
                              required
                              type="date"
                              value={data.membership.startsOn}
                              onChange={(event) =>
                                update({
                                  membership: {
                                    ...data.membership!,
                                    startsOn: event.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                          <label>
                            End / renewal date
                            <input
                              type="date"
                              min={data.membership.startsOn}
                              value={data.membership.endsOn ?? ''}
                              onChange={(event) =>
                                update({
                                  membership: {
                                    ...data.membership!,
                                    endsOn: event.target.value || null,
                                  },
                                })
                              }
                            />
                          </label>
                        </div>
                        <label>
                          Membership notes
                          <textarea
                            maxLength={4000}
                            value={data.membership.notes}
                            onChange={(event) =>
                              update({
                                membership: {
                                  ...data.membership!,
                                  notes: event.target.value,
                                },
                              })
                            }
                          />
                        </label>
                        <small>
                          For your records only. No payment is collected.
                        </small>
                      </>
                    )}
                    {select(
                      'Nutrition plan',
                      data.nutritionPlanId,
                      nutrition,
                      (id) => update({ nutritionPlanId: id }),
                    )}
                    {select('Workout program', data.programId, programs, (id) =>
                      update({ programId: id }),
                    )}
                    <label>
                      Exercise measurement preference
                      <select
                        value={data.exerciseUnit}
                        onChange={(event) =>
                          update({
                            exerciseUnit: event.target.value as 'KG' | 'LB',
                          })
                        }
                      >
                        <option value="KG">KG</option>
                        <option value="LB">LB</option>
                      </select>
                    </label>
                    <p className="wizard-hint">
                      Choose from your saved nutrition plans and published
                      workout programs. Selecting None removes the active
                      assignment when updating.
                    </p>
                  </>
                )}
                {step === 2 && (
                  <>
                    {select(
                      'Check-in form',
                      data.checkin?.formId ?? null,
                      forms,
                      (id) =>
                        update({
                          checkin: id
                            ? {
                                formId: id,
                                startDate: today(),
                                frequency: 'DAILY',
                                occurrences: 30,
                                weekdays: [],
                              }
                            : null,
                        }),
                    )}
                    {data.checkin && (
                      <>
                        <label>
                          First check-in date
                          <input
                            required
                            type="date"
                            value={data.checkin.startDate}
                            onChange={(event) =>
                              update({
                                checkin: {
                                  ...data.checkin!,
                                  startDate: event.target.value,
                                },
                              })
                            }
                          />
                        </label>
                        <label>
                          Check-in frequency
                          <select
                            value={data.checkin.frequency}
                            onChange={(event) =>
                              update({
                                checkin: {
                                  ...data.checkin!,
                                  frequency: event.target
                                    .value as Schedule['frequency'],
                                },
                              })
                            }
                          >
                            <option value="ONCE">Once</option>
                            <option value="DAILY">Every day</option>
                            <option value="WEEKLY">Every week</option>
                            <option value="BIWEEKLY">Every two weeks</option>
                            <option value="MONTHLY">Every month</option>
                          </select>
                        </label>
                        {['WEEKLY', 'BIWEEKLY'].includes(
                          data.checkin.frequency,
                        ) && (
                          <fieldset className="wizard-weekdays">
                            <legend>Check-in days</legend>
                            {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                              <button
                                type="button"
                                key={day}
                                aria-pressed={data.checkin!.weekdays.includes(
                                  day,
                                )}
                                onClick={() =>
                                  update({
                                    checkin: {
                                      ...data.checkin!,
                                      weekdays: data.checkin!.weekdays.includes(
                                        day,
                                      )
                                        ? data.checkin!.weekdays.filter(
                                            (item) => item !== day,
                                          )
                                        : [
                                            ...data.checkin!.weekdays,
                                            day,
                                          ].sort(),
                                    },
                                  })
                                }
                              >
                                {weekdays[day]}
                              </button>
                            ))}
                            <small>
                              Leave unselected to repeat on the weekday of the
                              first date.
                            </small>
                          </fieldset>
                        )}
                        {data.checkin.frequency !== 'ONCE' && (
                          <label>
                            Number of check-ins
                            <input
                              required
                              type="number"
                              min={1}
                              max={366}
                              value={data.checkin.occurrences}
                              onChange={(event) =>
                                update({
                                  checkin: {
                                    ...data.checkin!,
                                    occurrences: Number(event.target.value),
                                  },
                                })
                              }
                            />
                          </label>
                        )}
                      </>
                    )}
                    <label>
                      Initial questionnaire
                      <input
                        readOnly
                        value="Standard client onboarding questionnaire"
                      />
                      <small>
                        Clients complete their profile in My profile.
                      </small>
                    </label>
                    <p className="wizard-hint">
                      Daily check-ins use the selected form with Every day
                      frequency. Submitted answers are preserved. Updating a
                      schedule adds its missing dates; existing assignments
                      remain available.
                    </p>
                  </>
                )}
                {step === 3 && (
                  <div className="wizard-review">
                    <section>
                      <h3>
                        Personal information{' '}
                        <button type="button" onClick={() => setStep(0)}>
                          Edit
                        </button>
                      </h3>
                      <dl>
                        <dt>Name</dt>
                        <dd>
                          {data.firstName} {data.lastName}
                        </dd>
                        <dt>Email</dt>
                        <dd>{data.email}</dd>
                        <dt>Date of birth</dt>
                        <dd>{data.birthDate || 'Not provided'}</dd>
                        <dt>Phone</dt>
                        <dd>{data.phone || 'Not provided'}</dd>
                        <dt>Weight unit</dt>
                        <dd>{data.weightUnit}</dd>
                      </dl>
                    </section>
                    <section>
                      <h3>
                        Assigned plans{' '}
                        <button type="button" onClick={() => setStep(1)}>
                          Edit
                        </button>
                      </h3>
                      <dl>
                        <dt>Membership</dt>
                        <dd>
                          {data.membership
                            ? `${data.membership.name} · ${data.membership.status}`
                            : 'None'}
                        </dd>
                        {data.membership && (
                          <>
                            <dt>Membership dates</dt>
                            <dd>
                              {data.membership.startsOn} →{' '}
                              {data.membership.endsOn ?? 'No end date'}
                            </dd>
                            <dt>Membership notes</dt>
                            <dd>{data.membership.notes || 'None'}</dd>
                          </>
                        )}
                        <dt>Nutrition</dt>
                        <dd>{name(nutrition, data.nutritionPlanId)}</dd>
                        <dt>Workout program</dt>
                        <dd>{name(programs, data.programId)}</dd>
                        <dt>Exercise unit</dt>
                        <dd>{data.exerciseUnit}</dd>
                      </dl>
                    </section>
                    <section>
                      <h3>
                        Assigned form{' '}
                        <button type="button" onClick={() => setStep(2)}>
                          Edit
                        </button>
                      </h3>
                      <dl>
                        <dt>Check-in form</dt>
                        <dd>{name(forms, data.checkin?.formId ?? null)}</dd>
                        {data.checkin && (
                          <>
                            <dt>Schedule</dt>
                            <dd>
                              {data.checkin.frequency.toLowerCase()} from{' '}
                              {data.checkin.startDate} ·{' '}
                              {data.checkin.frequency === 'ONCE'
                                ? 1
                                : data.checkin.occurrences}{' '}
                              check-ins
                            </dd>
                            {['WEEKLY', 'BIWEEKLY'].includes(
                              data.checkin.frequency,
                            ) && (
                              <>
                                <dt>Check-in days</dt>
                                <dd>
                                  {data.checkin.weekdays
                                    .map((day) => weekdays[day])
                                    .join(', ') || 'Weekday of first date'}
                                </dd>
                              </>
                            )}
                          </>
                        )}
                        <dt>Initial questionnaire</dt>
                        <dd>Standard client onboarding</dd>
                      </dl>
                    </section>
                    {!editing && (
                      <p>
                        The client will receive a registration link for you to
                        share. Plans become accessible after registration and
                        coach approval.
                      </p>
                    )}
                  </div>
                )}
              </fieldset>
              <footer className="wizard-footer">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || step === 0}
                  onClick={() => setStep(step - 1)}
                >
                  Previous
                </button>
                <span>Step {step + 1} of 4</span>
                <button className="primary" disabled={busy || !!error}>
                  {busy
                    ? 'Saving…'
                    : step === 3
                      ? editing
                        ? 'Save changes'
                        : 'Create invitation'
                      : 'Next'}
                </button>
              </footer>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
