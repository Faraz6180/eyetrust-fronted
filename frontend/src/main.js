const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://faraz618-eyetrust-backend.hf.space/api';

let selectedFile=null,currentAdvice='',conversationHistory=[],recognition=null,lastPredictionData=null;

function showPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  const m={home:'navHome',detection:'navDetection',chat:'navChat'};
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  const el=document.getElementById(m[id]);
  if(el)el.classList.add('active');
}

document.getElementById('fileInput').addEventListener('change',function(e){
  const file=e.target.files[0];
  if(!file)return;
  selectedFile=file;
  const r=new FileReader();
  r.onload=function(e){
    document.getElementById('previewImage').src=e.target.result;
    document.getElementById('uploadPanel').style.display='none';
    document.getElementById('previewPanel').style.display='block';
  };
  r.readAsDataURL(file);
});

async function analyzeImage(){
  if(!selectedFile)return;
  document.getElementById('previewPanel').style.display='none';
  document.getElementById('loadingPanel').style.display='block';
  const fd=new FormData();
  fd.append('file',selectedFile);
  try{
    const res=await fetch(`${API_BASE_URL}/predict`,{method:'POST',body:fd});
    const data=await res.json();
    if(data.success){displayResults(data);}
    else{alert('Analysis failed: '+(data.detail||'Unknown error'));resetToUpload();}
  }catch{
    alert('❌ Connection error! Could not reach the backend API. Please try again in a moment.');
    resetToUpload();
  }
}

function resetToUpload(){
  document.getElementById('loadingPanel').style.display='none';
  document.getElementById('previewPanel').style.display='block';
}

function displayResults(data){
  lastPredictionData=data;
  document.getElementById('loadingPanel').style.display='none';
  document.getElementById('emptyRight').style.display='none';
  document.getElementById('resultImagePanel').style.display='block';
  document.getElementById('resultsPanel').style.display='block';
  const r=data.prediction;
  document.getElementById('resultImage').src=document.getElementById('previewImage').src;
  const badge=document.getElementById('diagnosisBadge');
  const isNorm=r.is_normal;
  badge.className='diag-badge '+(isNorm?'normal':'abnormal');
  badge.innerHTML=`<div class="diag-icon">${isNorm?'✓':'⚠'}</div><div><div class="diag-name">${r.predicted_class}</div><div class="diag-status">${isNorm?'No disease detected':'Condition identified'}</div></div>`;
  const dot=document.getElementById('resultDot');
  dot.className='panel-dot '+(isNorm?'green':'red');
  const conf=Math.round(r.confidence*100);
  document.getElementById('confPct').textContent=conf+'%';
  setTimeout(()=>{document.getElementById('confFill').style.width=conf+'%';},100);
  const grid=document.getElementById('probGrid');
  grid.innerHTML='';
  for(const[d,p]of Object.entries(r.all_probabilities)){
    const pct=Math.round(p*100);
    const top=d===r.predicted_class;
    grid.innerHTML+=`<div class="prob-item${top?' hl':''}"><div class="pi-name">${d}</div><div class="pi-val">${pct}<span style="font-size:13px;color:var(--text-muted)">%</span></div></div>`;
  }
  currentAdvice=data.ai_advice;
  document.getElementById('aiAdvice').textContent=currentAdvice;
}

function resetDetection(){
  selectedFile=null;lastPredictionData=null;
  document.getElementById('uploadPanel').style.display='block';
  document.getElementById('previewPanel').style.display='none';
  document.getElementById('loadingPanel').style.display='none';
  document.getElementById('resultImagePanel').style.display='none';
  document.getElementById('resultsPanel').style.display='none';
  document.getElementById('emptyRight').style.display='block';
  document.getElementById('fileInput').value='';
  document.getElementById('confFill').style.width='0';
  if(window.speechSynthesis)window.speechSynthesis.cancel();
}

async function downloadPDFReport(){
  if(!lastPredictionData){alert('No prediction data available.');return;}
  const patientName=prompt('Enter patient name (optional):','Patient')||'Patient';
  try{
    const res=await fetch(`${API_BASE_URL}/generate-report`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prediction_data:lastPredictionData,patient_name:patientName})});
    const blob=await res.blob();
    const url=window.URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=`EyeTrust_Report_${Date.now()}.pdf`;
    document.body.appendChild(a);a.click();
    window.URL.revokeObjectURL(url);document.body.removeChild(a);
    alert('✅ PDF Report downloaded!');
  }catch{alert('❌ Failed to generate PDF. Ensure backend is running.');}
}

function speakAdvice(){
  if(!('speechSynthesis'in window)){alert('Speech not supported in this browser.');return;}
  window.speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(currentAdvice);
  u.rate=0.9;u.pitch=1;
  window.speechSynthesis.speak(u);
}

function askQuestion(){
  showPage('chat');
  const name=document.getElementById('diagnosisBadge')?.querySelector('.diag-name')?.textContent||'an eye condition';
  document.getElementById('chatInput').value=`I was diagnosed with ${name}. What should I do next?`;
  document.getElementById('chatInput').focus();
}

async function sendMessage(){
  const input=document.getElementById('chatInput');
  const msg=input.value.trim();
  if(!msg)return;
  addMsg('user',msg);
  input.value='';
  conversationHistory.push({role:'user',content:msg});
  const tid=addMsg('bot','<em style="color:var(--text-faint)">Thinking...</em>');
  try{
    const res=await fetch(`${API_BASE_URL}/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:msg,conversation_history:conversationHistory.slice(-10)})});
    const data=await res.json();
    document.getElementById(tid)?.remove();
    if(data.success){
      addMsg('bot',data.response);
      conversationHistory.push({role:'assistant',content:data.response});
      if('speechSynthesis'in window){const u=new SpeechSynthesisUtterance(data.response);u.rate=0.9;window.speechSynthesis.speak(u);}
    }else{addMsg('bot','❌ An error occurred. Please try again.');}
  }catch{document.getElementById(tid)?.remove();addMsg('bot','❌ Connection error. Make sure backend is running on port 8000.');}
}

function addMsg(role,html){
  const c=document.getElementById('chatMessages');
  const id='msg-'+Date.now()+Math.random().toString(36).slice(2);
  const d=document.createElement('div');
  d.className='msg '+role;d.id=id;
  d.innerHTML=`<div class="msg-av ${role}">${role==='bot'?'👁':'◉'}</div><div class="msg-bubble">${html}</div>`;
  c.appendChild(d);c.scrollTop=c.scrollHeight;
  return id;
}

function toggleVoiceInput(){
  if(!('webkitSpeechRecognition'in window||'SpeechRecognition'in window)){alert('Voice input not supported. Use Chrome or Edge.');return;}
  const btn=document.getElementById('voiceBtn');
  if(recognition&&btn.classList.contains('listening')){recognition.stop();btn.classList.remove('listening');btn.textContent='🎤';return;}
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  recognition=new SR();recognition.continuous=false;recognition.interimResults=false;recognition.lang='en-US';
  recognition.onstart=()=>{btn.classList.add('listening');btn.textContent='⏹';};
  recognition.onresult=e=>{document.getElementById('chatInput').value=e.results[0][0].transcript;btn.classList.remove('listening');btn.textContent='🎤';};
  recognition.onerror=()=>{btn.classList.remove('listening');btn.textContent='🎤';};
  recognition.onend=()=>{btn.classList.remove('listening');btn.textContent='🎤';};
  recognition.start();
}

// Expose functions called from inline HTML onclick/onkeypress handlers
window.showPage = showPage;
window.analyzeImage = analyzeImage;
window.resetDetection = resetDetection;
window.downloadPDFReport = downloadPDFReport;
window.speakAdvice = speakAdvice;
window.askQuestion = askQuestion;
window.sendMessage = sendMessage;
window.toggleVoiceInput = toggleVoiceInput;
