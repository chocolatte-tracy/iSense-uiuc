import type {PlaceSuggestion,PlacesOptions} from './types';
import type {SelectedLocation} from './campus-locations';
export function usePlacesAutocomplete(_options:PlacesOptions|undefined,_query:string,_active:boolean){return {suggestions:[] as PlaceSuggestion[],status:'idle' as string,message:'',select:async(_suggestion:PlaceSuggestion):Promise<SelectedLocation>=>{throw new Error('Baseline only; Places is disabled.');}};}
