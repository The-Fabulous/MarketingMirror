const $ = id => document.getElementById(id);
const staticPreview = location.hostname.endsWith('.github.io');
let apiAvailable = false;
let mode = 'text', file = null, videoUrl = null, busy = false;
function message(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
function update() {
  $('count').textContent = `${$('source-text').value.length.toLocaleString('ru')} / 12 000`;
  $('submit').disabled = busy || !apiAvailable || (mode === 'text' ? !$('source-text').value.trim() : !file);
  $('submit').textContent = busy ? 'Обрабатываем…' : mode === 'text' ? 'Перевести на английский ↗' : 'Распознать речь из видео ↗';
  for (const id of ['text-tab','video-tab','source-text','text-file','video-file','remove-video','example']) $(id).disabled = busy;
  $('privacy').textContent = !apiAvailable ? 'Материалы остаются в браузере — отправка недоступна.' : mode === 'text' ? 'При переводе текст отправляется в Google AI.' : 'При распознавании видео отправляется в Google AI.';
}
function switchMode(next) {
  if (busy) return;
  mode = next;
  for (const type of ['text','video']) { $(`${type}-tab`).setAttribute('aria-selected', String(type === mode)); $(`${type}-pane`).hidden = type !== mode; }
  message(''); update();
}
$('text-tab').onclick = () => switchMode('text');
$('video-tab').onclick = () => switchMode('video');
for (const type of ['text','video']) $(`${type}-tab`).onkeydown = event => {
  if (['ArrowLeft','ArrowRight'].includes(event.key)) { event.preventDefault(); switchMode(type === 'text' ? 'video' : 'text'); $(`${mode}-tab`).focus(); }
};
function clearResult() { $('result-text').value = ''; $('result-text').hidden = true; $('empty-result').hidden = false; $('copy').disabled = $('download').disabled = true; $('result-status').textContent = 'Готовы, когда вы готовы'; }
$('source-text').oninput = () => { clearResult(); update(); };
$('example').onclick = () => { $('source-text').value = 'Большие перемены начинаются с маленьких привычек.\n\nНайдите свой ритм с The Fabulous: создавайте утренние ритуалы, заботьтесь о себе и двигайтесь к тому, что важно для вас.'; clearResult(); update(); $('source-text').focus(); };
$('text-file').onchange = async event => {
  const selected = event.target.files[0]; if (!selected) return;
  try {
    if (!/\.txt$/i.test(selected.name) || selected.size > 60000) throw new Error('Выберите файл .txt размером до 60 КБ.');
    const text = await selected.text();
    if (text.length > 12000) throw new Error('В файле больше 12 000 символов. Сократите текст.');
    $('source-text').value = text; clearResult(); update(); message(`Загружен файл ${selected.name}`);
  } catch (error) { message(error.message, true); }
  event.target.value = '';
};
function selectVideo(selected) {
  if (busy || !selected) return;
  const extension = selected.name.split('.').pop().toLowerCase();
  const mimeType = { mp4:'video/mp4', webm:'video/webm', mov:'video/quicktime' }[extension];
  if (!mimeType) return message('Поддерживаются MP4, WebM и MOV.', true);
  if (!selected.size || selected.size > 12 * 1024 * 1024) return message('Выберите непустое видео до 12 МБ.', true);
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  file = { blob: selected, mimeType }; videoUrl = URL.createObjectURL(selected);
  $('player').src = videoUrl; $('filename').textContent = `${selected.name} · ${(selected.size / 1024 / 1024).toFixed(1)} МБ`;
  $('video-preview').hidden = false; $('dropzone').hidden = true; clearResult(); message('Видео готово к распознаванию.'); update();
}
$('video-file').onchange = event => { selectVideo(event.target.files[0]); event.target.value = ''; };
$('remove-video').onclick = () => { if(videoUrl) URL.revokeObjectURL(videoUrl); videoUrl = null; file = null; $('player').removeAttribute('src'); $('player').load(); $('video-preview').hidden = true; $('dropzone').hidden = false; update(); };
for (const type of ['dragover','dragleave','drop']) $('dropzone').addEventListener(type, event => {
  event.preventDefault(); $('dropzone').classList.toggle('drag', type === 'dragover');
  if (type === 'drop') selectVideo(event.dataTransfer.files[0]);
});
async function api(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Ошибка обработки запроса.'); return data;
}
function base64(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('Не удалось прочитать видео.')); reader.readAsDataURL(blob); }); }
$('submit').onclick = async () => {
  if (busy || !apiAvailable) return;
  busy = true; clearResult(); update(); message(mode === 'video' ? 'Распознаём речь. Это может занять до двух минут…' : 'Gemma 4 переводит текст на английский…');
  try {
    if (mode === 'video') {
      const data = await api('/api/transcribe', { data: await base64(file.blob), mimeType: file.mimeType });
      $('source-text').value = data.text; busy = false; switchMode('text'); message('Речь распознана. Проверьте текст и нажмите «Перевести на английский».');
    } else {
      const data = await api('/api/translate', { text: $('source-text').value });
      $('result-text').value = data.text; $('result-text').hidden = false; $('empty-result').hidden = true;
      $('copy').disabled = $('download').disabled = false; $('result-status').textContent = 'Переведено · Gemma 4'; message('Перевод готов.');
    }
  } catch (error) { message(error instanceof TypeError ? 'Нет соединения с сервером. Попробуйте ещё раз.' : error.message, true); }
  finally { busy = false; update(); }
};
$('copy').onclick = async () => { try { await navigator.clipboard.writeText($('result-text').value); message('Перевод скопирован.'); } catch { message('Не удалось скопировать. Выделите текст и скопируйте вручную.', true); } };
$('download').onclick = () => { const url = URL.createObjectURL(new Blob([$('result-text').value], {type:'text/plain;charset=utf-8'})); const link = document.createElement('a'); link.href = url; link.download = 'marketing-mirror-en.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
function showPreviewNotice(text) {
  $('connection').textContent = '○ Демо интерфейса';
  $('hosting-note').textContent = text;
  $('hosting-note').hidden = false;
}
if (staticPreview) {
  showPreviewNotice('Это демо: можно добавить текст и посмотреть видео. Перевод и распознавание речи станут доступны после подключения сервера.');
} else {
  fetch('./api/status', { signal: AbortSignal.timeout(10000) }).then(async response => {
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('API unavailable');
    const data = await response.json();
    if (typeof data.configured !== 'boolean') throw new Error('API unavailable');
    apiAvailable = true;
    $('connection').textContent = data.configured ? '● API подключён · Gemma 4' : '○ Для перевода нужен ключ API';
    update();
  }).catch(() => {
    showPreviewNotice('Сервер перевода недоступен. Пока можно работать с текстом и смотреть видео. Если сервер уже запущен, обновите страницу.');
    update();
  });
}
update();
