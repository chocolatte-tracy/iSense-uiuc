export type SunContext={phase:'daytime'|'nighttime'|'unavailable';sunrise:Date|null;sunset:Date|null;departureTime:Date;localDate:string};
export function sunClockLabel(value:Date){return new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(value);}
