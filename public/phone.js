function phoneParts(value,country='ID'){
 const parsed=libphonenumber.parsePhoneNumberFromString(value||'',country);
 return {country:parsed?.country||country,local:parsed?.nationalNumber||value||'',number:parsed?.isValid()?parsed.number:null};
}
function phoneFields(record,scope,required=false){
 const parts=phoneParts(record.phone,record.phone_country||'ID');
 const names=new Intl.DisplayNames(['id'],{type:'region'});
 const countries=libphonenumber.getCountries().sort((a,b)=>a==='ID'?-1:b==='ID'?1:names.of(a).localeCompare(names.of(b),'id'));
 return `<fieldset class="phone-field" data-scope="${scope}"><legend>${scope==='business'?'Telepon perusahaan':'Nomor telepon'}${required?requiredMark:''}</legend><div class="phone-grid"><div class="field"><label for="phone-country-${scope}">Negara / kode</label><select id="phone-country-${scope}" name="phone_country" autocomplete="tel-country-code">${countries.map(country=>`<option value="${country}" ${country===parts.country?'selected':''}>${esc(names.of(country))} (+${libphonenumber.getCountryCallingCode(country)})</option>`).join('')}</select></div><div class="field"><label for="phone-number-${scope}">Nomor ${required?'':'(opsional)'}</label><input id="phone-number-${scope}" name="phone" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="30" value="${esc(parts.local)}" placeholder="812 3456 7890" ${required?'required':''}></div></div><div class="phone-verification-row"><span class="phone-state ${record.phone_verified?'confirmed':''}" role="status">${record.phone_verified?icon('check')+' Nomor terverifikasi':record.phone?'Nomor belum terverifikasi':'Belum ada nomor'}</span><button type="button" class="btn btn-outline" data-action="phone-send" data-scope="${scope}" ${!record.phone||record.phone_verified?'disabled':''}>${record.phone_verified?'Terverifikasi':record.phone_verification?'Masukkan kode SMS':'Kirim kode SMS'}</button></div><p class="field-hint">Pilih negara lalu masukkan nomor. Contoh Indonesia: 0812… atau 812… menjadi +62812…. Simpan perubahan sebelum verifikasi. Gunakan nomor seluler yang dapat menerima SMS.</p></fieldset>`;
}
function phoneRecord(scope){return scope==='business'?state.user?.company:state.user;}
function phoneInputValue(group){
 const country=group.querySelector('[name=phone_country]').value,raw=group.querySelector('[name=phone]').value;
 const parsed=libphonenumber.parsePhoneNumberFromString(raw,country);
 return parsed?.isValid()&&parsed.country===country?parsed.number:null;
}
function updatePhoneState(group){
 const record=phoneRecord(group.dataset.scope)||{},stored=phoneParts(record.phone,record.phone_country||'ID').number;
 const current=phoneInputValue(group),changed=current!==stored||(!current&&group.querySelector('[name=phone]').value.trim()!==String(record.phone||''));
 const status=group.querySelector('.phone-state'),button=group.querySelector('[data-action=phone-send]');
 status.textContent=changed?'Nomor berubah, simpan terlebih dahulu':record.phone_verified?'Nomor terverifikasi':record.phone?'Nomor belum terverifikasi':'Belum ada nomor';
 status.classList.toggle('confirmed',!changed&&!!record.phone_verified);button.disabled=changed||!current||!!record.phone_verified;
}
function phoneVerificationPrompt(scope,number,verification){
 const record=phoneRecord(scope);if(record)record.phone_verification=verification;
 modal(`<h2>Verifikasi nomor telepon</h2><p class="subtitle">Kode SMS 6 angka dikirim ke <strong>${esc(number)}</strong>.</p><form id="phone-verification-form" data-scope="${scope}"><div class="field"><label for="f-code">Kode SMS 6 angka</label><input class="otp-code" id="f-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" placeholder="000000" required><small>Kode berlaku maksimal 10 menit. Jangan bagikan kode kepada siapa pun.</small></div><div class="form-error" role="alert"></div><button type="submit" class="btn btn-primary full">Verifikasi nomor</button></form><div class="verification-options"><button type="button" class="text-link" data-action="phone-resend" data-scope="${scope}">Kirim ulang SMS</button><button type="button" class="text-link" data-action="close">Nanti saja</button></div><p class="field-hint">Tunggu 60 detik sebelum mengirim ulang. Maksimal 5 pengiriman per hari. Jika mengganti nomor, simpan nomor baru dan mulai verifikasi lagi.</p>`);
}
document.addEventListener('input',e=>{const group=e.target.closest('.phone-field');if(group)updatePhoneState(group);});
document.addEventListener('change',e=>{const group=e.target.closest('.phone-field');if(group)updatePhoneState(group);});
document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-action]');if(!button||!['phone-send','phone-resend'].includes(button.dataset.action))return;
 const scope=button.dataset.scope,record=phoneRecord(scope);if(!record)return;
 const group=button.closest('.phone-field');
 if(group&&phoneInputValue(group)!==phoneParts(record.phone,record.phone_country||'ID').number)return toast('Simpan perubahan nomor terlebih dahulu.');
 const pending=record.phone_verification;
 if(button.dataset.action==='phone-send'&&pending?.expires>Date.now())return phoneVerificationPrompt(scope,record.phone,pending);
 button.disabled=true;
 try{const result=await post('/phone/send',{scope,sms_consent:true});phoneVerificationPrompt(scope,result.number,result.verification);}
 catch(error){const field=document.querySelector('#phone-verification-form .form-error');if(field)field.textContent=error.message;else toast(error.message);}
 finally{button.disabled=false;}
});
document.addEventListener('submit',async e=>{
 const form=e.target;if(form.id!=='phone-verification-form')return;e.preventDefault();
 const button=form.querySelector('[type=submit]'),error=form.querySelector('.form-error');button.disabled=true;error.textContent='';
 try{const result=await post('/phone/confirm',{scope:form.dataset.scope,code:form.elements.code.value});state.user=result.user;closeModal();await refresh();toast('Nomor telepon berhasil diverifikasi.');}
 catch(err){error.textContent=err.message;}finally{button.disabled=false;}
});
