# Free iPad night mode

This keeps the iPad unlocked and the dashboard open. It does not power off the display backlight or lock/unlock iPadOS.

1. On the dashboard: Settings → Night schedule. Choose start/end times in Hamburg time (Europe/Berlin), enable Scheduled black screen, and Save schedule. The default 23:00–07:00 values are suggestions; the schedule starts disabled. Saved times apply to all connected dashboards. Tapping a scheduled black screen temporarily restores this browser until the next night window; it does not disable the schedule for other devices.
2. On the iPad: Shortcuts → Automation → + → Time of Day → choose the same night start time → Daily → Run Immediately → add Set Brightness → 0%.
3. Create a second daily Time of Day automation for the morning end time, Set Brightness → 50% (or preferred level), Run Immediately.
4. Keep Safari / Home Screen web app open. Set iPad Auto-Lock to Never, and enable Keep screen awake in the dashboard. Do not add Lock Screen or Shut Down to the shortcuts: the browser cannot unlock the iPad in the morning.
5. Confirm iPad time zone is Hamburg/Berlin and Set Automatically is enabled. The dashboard uses Europe/Berlin independently of browser time zone; Shortcuts uses device time. Test both automations with times a few minutes ahead before relying on them overnight.

Initial setup requires interaction on the iPad. After setup, the daily schedule does not require taps. Reboots, OS updates or the app being closed may require reopening/unlocking. Reduce automatic brightness if it overrides your preferred night level; test on the actual iPad.

Source for scheduled personal automations: https://support.apple.com/guide/shortcuts/enable-or-disable-a-personal-automation-apd602971e63/ios
