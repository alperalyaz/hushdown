; HushDown — Ctrl+F12 ile odaktaki alana yyyyMMddHHmmss zaman damgası yazar.
; AutoHotkey v1 ile uyumludur (Send {Text} için v1.1.27+ önerilir).
;
; --- Windows başlangıcına ekleme ---
; 1) Bu dosyayı sabit bir konuma kaydedin (ör. Belgeler\HushDown\HushDown.ahk).
; 2) Win+R -> shell:startup yazıp Enter.
; 3) Açılan Klasöre bu .ahk dosyasının kısayolunu sürükleyin (isteğe bağlı: kısayol
;    Özellikler -> Çalıştır: Minimize).
; Alternatif: Görev Zamanlayıcı ile oturum açılışında çalıştırabilirsiniz.
; ---

#NoEnv
#SingleInstance Force
SendMode Input
SetWorkingDir %A_ScriptDir%

^F12::
    FormatTime, ts,, yyyyMMddHHmmss
    SendInput, {Text}%ts%
return
