import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Clock3, MapPin, MapPinned, Plus, RefreshCw, Send, Volume2, UsersRound } from 'lucide-react';
import { DetailsSheet } from '@/components/details-sheet';
import { campusLocations } from '@/lib/campus-locations';
import type { CommunityReport, CommunityReportInput } from '@workspace/api-client-react';

type ReportNoise = CommunityReportInput['noise'];
type ReportCrowds = CommunityReportInput['crowds'];
type DateValidation = { value: string; message: string | null };

function localDateTimeValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function relativeAge(value: string) {
  const ageMinutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (ageMinutes < 1) return 'Just now';
  if (ageMinutes < 60) return `${ageMinutes} min ago`;
  const hours = Math.floor(ageMinutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function validateObservationTime(value: string): DateValidation {
  if (!value) return { value, message: 'Choose when you observed these conditions.' };
  const timestamp = new Date(value).getTime();
  const now = Date.now();
  if (!Number.isFinite(timestamp)) return { value, message: 'Enter a valid observation time.' };
  if (timestamp < now - 7 * 24 * 60 * 60 * 1000) return { value, message: 'Reports must be from the last 7 days.' };
  if (timestamp > now + 5 * 60 * 1000) return { value, message: 'Observation time cannot be more than 5 minutes in the future.' };
  return { value, message: null };
}

function apiErrorMessage(error: unknown) {
  if (error instanceof Error && /network|fetch|offline/i.test(error.message)) {
    return 'The shared report service could not be reached. Check your connection and try again.';
  }
  if (error instanceof Error && error.message) return 'The report could not be saved. Please try again.';
  return 'The report could not be saved. Please try again.';
}

export function ReportsScreen({ active, reports, storage, loading, error, refresh, submit, submitting,
  pendingPoint, onClearPoint, onPickOnMap, mapAvailable, onFormReopenKey }: {
  active: boolean;
  reports: CommunityReport[];
  storage?: 'shared';
  loading: boolean;
  error: unknown;
  refresh: () => void;
  submit: (input: CommunityReportInput) => Promise<CommunityReport>;
  submitting: boolean;
  pendingPoint: [number, number] | null;
  onClearPoint: () => void;
  onPickOnMap: () => void;
  mapAvailable: boolean;
  onFormReopenKey: number;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [consumedReopenKey, setConsumedReopenKey] = useState(0);
  const [detailsReport, setDetailsReport] = useState<CommunityReport | null>(null);
  const [campusId, setCampusId] = useState(campusLocations[0]?.id ?? '');
  const [locationMode, setLocationMode] = useState<'campus' | 'map'>('campus');
  const [noise, setNoise] = useState<ReportNoise>('moderate');
  const [crowds, setCrowds] = useState<ReportCrowds>('moderate');
  const [observedAt, setObservedAt] = useState(() => localDateTimeValue(new Date()));
  const [formError, setFormError] = useState('');
  const [confirmation, setConfirmation] = useState('');

  useEffect(() => {
    if (pendingPoint) setLocationMode('map');
  }, [pendingPoint]);

  useEffect(() => {
    if (active && onFormReopenKey > consumedReopenKey) {
      setConsumedReopenKey(onFormReopenKey);
      setFormError('');
      setFormOpen(true);
    }
  }, [active, onFormReopenKey, consumedReopenKey]);

  const chosenPlace = campusLocations.find(place => place.id === campusId);
  const locationName = locationMode === 'map' && pendingPoint ? 'Selected campus point'
    : chosenPlace?.name ?? '';
  const timeValidation = useMemo(() => validateObservationTime(observedAt), [observedAt]);
  const serviceError = Boolean(error);
  const noSharedStorage = !loading && !serviceError && storage !== 'shared';

  const beginReport = () => {
    setConfirmation('');
    setFormError('');
    setObservedAt(localDateTimeValue(new Date()));
    setFormOpen(true);
  };

  const closeForm = () => setFormOpen(false);

  const chooseCampus = (value: string) => {
    setCampusId(value);
    setLocationMode('campus');
    onClearPoint();
  };

  const selectMapPoint = () => {
    if (!mapAvailable) {
      setFormError('Map selection is unavailable because Google Maps is not enabled. Choose a campus place instead.');
      return;
    }
    setFormError('');
    setFormOpen(false);
    onPickOnMap();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    const checkedTime = validateObservationTime(observedAt);
    if (checkedTime.message) {
      setFormError(checkedTime.message);
      return;
    }
    const point = locationMode === 'map' ? pendingPoint : chosenPlace?.coordinates;
    if (!point || !locationName) {
      setFormError('Choose a campus place or select a point on the map.');
      return;
    }
    if (noSharedStorage || serviceError || storage !== 'shared') {
      setFormError('Shared reports are unavailable right now. Your report has not been saved.');
      return;
    }
    const input: CommunityReportInput = {
      locationName,
      latitude: point[0],
      longitude: point[1],
      noise,
      crowds,
      observedAt: new Date(observedAt).toISOString(),
    };
    try {
      const saved = await submit(input);
      setFormOpen(false);
      setConfirmation('Report saved to the shared community list.');
      setDetailsReport(saved);
    } catch (submitError) {
      setFormError(apiErrorMessage(submitError));
    }
  };

  return <>
    <section className="app-screen reports-screen" aria-label="Community reports"
      aria-hidden={!active} hidden={!active} inert={!active}>
      <header className="native-screen-heading">
        <div><div className="eyebrow">CAMPUS OBSERVATIONS</div><h1>Community Reports</h1></div>
        <button className="reports-refresh" type="button" aria-label="Refresh community reports"
          onClick={() => refresh()} disabled={loading} data-testid="button-refresh-reports">
          <RefreshCw size={18} aria-hidden="true"/>
        </button>
      </header>
      <p className="reports-intro">Recent, unverified notes from people on campus. These never affect route rankings.</p>
      <aside className="community-future-card" aria-labelledby="community-future-title">
        <h2 id="community-future-title">Building Community-Powered Routes</h2>
        <p>Today, reports help students share local noise and crowd observations. In a future version, aggregated and quality-checked reports could help improve personalized route recommendations.</p>
        <small>Prototype · Reports do not currently affect route rankings.</small>
      </aside>
      <button type="button" className="reports-new-button" onClick={beginReport} data-testid="button-new-report">
        <Plus size={18} aria-hidden="true"/> New Report
      </button>
      {confirmation && <p className="reports-confirmation" role="status" data-testid="status-report-confirmation">{confirmation}</p>}
      <div className="reports-list-heading"><h2>Recent reports</h2><span>{reports.length}</span></div>
      {loading ? <div className="reports-state reports-loading" role="status" aria-label="Loading community reports">
        <span/><span/><span/>
      </div> : serviceError ? <div className="reports-state reports-error" role="alert">
        <strong>Reports could not be loaded</strong>
        <p>The shared report service is unavailable. No local copy is being shown.</p>
        <button type="button" onClick={() => refresh()} data-testid="button-retry-reports">Try again</button>
      </div> : noSharedStorage ? <div className="reports-state" role="status">
        <strong>Shared reports are unavailable</strong>
        <p>Reports are not stored on this device. Try again when the shared service is available.</p>
      </div> : reports.length === 0 ? <div className="reports-state reports-empty" data-testid="empty-community-reports">
        <span className="reports-empty-mark"><MapPinned size={21} aria-hidden="true"/></span>
        <strong>No reports yet</strong>
        <p>Share a brief note about noise or crowds to help the campus community.</p>
      </div> : <div className="reports-list" aria-label="Recent community reports">
        {reports.map(report => <button className="report-card" type="button" key={report.id}
          onClick={() => setDetailsReport(report)} data-testid={`card-community-report-${report.id}`}>
          <span className="report-card-top"><strong>{report.locationName}</strong><span>{relativeAge(report.observedAt)}</span></span>
          <span className="report-card-meta"><span><Volume2 size={14} aria-hidden="true"/> {report.noise}</span>
            <span><UsersRound size={14} aria-hidden="true"/> {report.crowds} crowds</span></span>
          <span className="report-observed-time"><Clock3 size={13} aria-hidden="true"/>
            {new Date(report.observedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
        </button>)}
      </div>}
      <p className="reports-footnote">Observations are community submitted and not verified measurements.</p>
    </section>

    <DetailsSheet title="New community report" open={formOpen} ownerActive={active} onClose={closeForm}>
      <form className="report-form" onSubmit={event => void handleSubmit(event)} noValidate>
        <label className="report-field-label" htmlFor="report-campus-location">Location</label>
        <select id="report-campus-location" value={locationMode === 'map' ? 'map' : campusId}
          onChange={event => event.target.value === 'map' ? selectMapPoint() : chooseCampus(event.target.value)}
          data-testid="select-report-location">
          {campusLocations.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}
          {locationMode === 'map' && pendingPoint && <option value="map">Selected campus point</option>}
        </select>
        <button className="report-map-choice" type="button" onClick={selectMapPoint} disabled={!mapAvailable}
          data-testid="button-report-choose-map">
          <MapPin size={17} aria-hidden="true"/>{pendingPoint ? 'Choose a different point on map' : 'Choose on map'}
        </button>
        {!mapAvailable && <p className="report-field-help">Map selection is unavailable because Google Maps is not enabled. You can still choose a campus place above.</p>}
        {locationMode === 'map' && pendingPoint && <p className="report-coordinate-note">
          Selected point: {pendingPoint[0].toFixed(5)}, {pendingPoint[1].toFixed(5)}. No address lookup is performed.
        </p>}
        <fieldset className="report-choice-group">
          <legend>Noise</legend>
          <div className="report-choice-row">{([
            ['quiet', 'Quiet'], ['moderate', 'Moderate'], ['loud', 'Loud'],
          ] as const).map(([value, label]) => <label key={value}>
            <input type="radio" name="report-noise" value={value} checked={noise === value}
              onChange={() => setNoise(value)} data-testid={`radio-report-noise-${value}`}/>
            <span>{label}</span>
          </label>)}</div>
        </fieldset>
        <fieldset className="report-choice-group">
          <legend>Crowds</legend>
          <div className="report-choice-row">{([
            ['low', 'Low'], ['moderate', 'Moderate'], ['high', 'High'],
          ] as const).map(([value, label]) => <label key={value}>
            <input type="radio" name="report-crowds" value={value} checked={crowds === value}
              onChange={() => setCrowds(value)} data-testid={`radio-report-crowds-${value}`}/>
            <span>{label}</span>
          </label>)}</div>
        </fieldset>
        <label className="report-field-label" htmlFor="report-observed-at">Observation time (your local time)</label>
        <input id="report-observed-at" className="report-datetime" type="datetime-local" value={observedAt}
          onChange={event => setObservedAt(event.target.value)} aria-invalid={Boolean(timeValidation.message)}
          aria-describedby="report-time-help" data-testid="input-report-observed-at"/>
        <p id="report-time-help" className="report-field-help">Choose a time within the last 7 days, no more than 5 minutes ahead. Defaults to now.</p>
        <p className="report-field-help">Your chosen location, time and categories will be public. Do not share personal information. Reports are unverified and never used for route scoring.</p>
        {formError && <p className="report-form-error" role="alert" data-testid="error-report-form">{formError}</p>}
        <button className="report-submit-button" type="submit" disabled={submitting || noSharedStorage || serviceError}
          data-testid="button-submit-report">
          <Send size={16} aria-hidden="true"/>{submitting ? 'Saving report…' : 'Submit report'}
        </button>
      </form>
    </DetailsSheet>

    <DetailsSheet title="Report details" open={Boolean(detailsReport)} ownerActive={active}
      onClose={() => setDetailsReport(null)}>
      {detailsReport && <div className="report-detail">
        <div className="report-detail-location"><MapPin size={17} aria-hidden="true"/><strong>{detailsReport.locationName}</strong></div>
        <dl><div><dt>Noise</dt><dd>{detailsReport.noise}</dd></div><div><dt>Crowds</dt><dd>{detailsReport.crowds}</dd></div>
          <div><dt>Observed</dt><dd>{new Date(detailsReport.observedAt).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}</dd></div>
          <div><dt>Latitude</dt><dd>{detailsReport.latitude.toFixed(5)}</dd></div>
          <div><dt>Longitude</dt><dd>{detailsReport.longitude.toFixed(5)}</dd></div></dl>
        <p>Community-submitted and unverified. This observation is informational only and does not affect route ranking.</p>
      </div>}
    </DetailsSheet>
  </>;
}
