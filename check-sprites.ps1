Add-Type -AssemblyName System.Drawing
$files = Get-ChildItem "C:\Users\PC-YV-DN\work\zombie-blaster\Free Pixel Effects Pack\*.png" | Where-Object { $_.Name -ne "cover.png" } | Sort-Object Name
foreach ($f in $files) {
  $img = [System.Drawing.Image]::FromFile($f.FullName)
  $cols = [math]::Floor($img.Width / 100)
  $rows = [math]::Floor($img.Height / 100)
  Write-Host "$($f.Name): $($img.Width)x$($img.Height) cols=$cols rows=$rows"
  $img.Dispose()
}
