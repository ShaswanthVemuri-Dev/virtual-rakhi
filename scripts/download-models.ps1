$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$modelDir = Join-Path $root "public\models"
New-Item -ItemType Directory -Force -Path $modelDir | Out-Null

$models = @(
  @{ Name = "face_landmarker.task"; Url = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" },
  @{ Name = "hand_landmarker.task"; Url = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task" },
  @{ Name = "pose_landmarker.task"; Url = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task" }
)

foreach ($model in $models) {
  $target = Join-Path $modelDir $model.Name
  if ((Test-Path $target) -and ((Get-Item $target).Length -gt 100000)) {
    Write-Host "[models] $($model.Name) already present."
    continue
  }

  Write-Host "[models] Downloading $($model.Name)..."
  try {
    Invoke-WebRequest -Uri $model.Url -OutFile $target -UseBasicParsing
  }
  catch {
    if (Test-Path $target) { Remove-Item $target -Force }
    throw "Could not download $($model.Name). Check your internet connection and run START.bat again. $($_.Exception.Message)"
  }
}

Write-Host "[models] MediaPipe task models are ready."
