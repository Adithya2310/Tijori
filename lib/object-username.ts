export function usernameKey(value:string) { return value.trim().normalize('NFC').toLowerCase(); }

export function findUsername<T extends {name:string}>(records:T[],username:string):T {
 const key=usernameKey(username);
 if(!key)throw Error('Enter your username first.');
 const matches=records.filter(record=>usernameKey(record.name)===key);
 if(matches.length!==1)throw Error(matches.length?'This username is ambiguous in older records. Use its original backup; no identity was selected.':'No object identity exists for that username on this server.');
 return matches[0];
}
