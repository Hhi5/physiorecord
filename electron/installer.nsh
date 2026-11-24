; PhysioRecord NSIS installer hooks — automatically allows local Clinic Wi-Fi Sync
; through Windows Defender Firewall when installed with elevation (silent no-op if per-user).

!macro customInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="PhysioRecord Clinic Wi-Fi Sync"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="PhysioRecord Clinic Wi-Fi Sync" dir=in action=allow protocol=TCP localport=47821'
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="PhysioRecord Clinic Wi-Fi Sync"'
!macroend
