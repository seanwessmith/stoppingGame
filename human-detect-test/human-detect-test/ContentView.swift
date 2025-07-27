import UIKit
import AVFoundation
import Vision

class ViewController: UIViewController {
    private let captureSession = AVCaptureSession()
    private var previewLayer: AVCaptureVideoPreviewLayer!
    private let detectionOverlay = CALayer()
    private lazy var visionSequenceHandler = VNSequenceRequestHandler()

    override func viewDidLoad() {
        super.viewDidLoad()
        setupCamera()
        setupOverlay()
        captureSession.startRunning()
    }

    private func setupCamera() {
        captureSession.sessionPreset = .high
        guard
            let cam = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
            let input = try? AVCaptureDeviceInput(device: cam)
        else {
            fatalError("Can't open back camera")
        }
        captureSession.addInput(input)

        let output = AVCaptureVideoDataOutput()
        output.setSampleBufferDelegate(self, queue: DispatchQueue(label: "videoQueue"))
        captureSession.addOutput(output)

        previewLayer = AVCaptureVideoPreviewLayer(session: captureSession)
        previewLayer.videoGravity = .resizeAspectFill
        previewLayer.frame = view.bounds
        view.layer.addSublayer(previewLayer)
    }

    private func setupOverlay() {
        detectionOverlay.frame = view.bounds
        detectionOverlay.sublayers = []
        view.layer.addSublayer(detectionOverlay)
    }

    private func process(buffer: CVPixelBuffer) {
        let request = VNDetectHumanRectanglesRequest { [weak self] req, _ in
            DispatchQueue.main.async {
                self?.drawDetections(on: req)
            }
        }
        // switch to the new human‐rectangle revision and detect full bodies
        request.revision = VNDetectHumanRectanglesRequestRevision2
        request.upperBodyOnly = false  // whole‐body detection  [oai_citation:3‡rockyshikoku.medium.com](https://rockyshikoku.medium.com/detecting-a-persons-whole-body-box-with-ios-computer-vision-7ebaba32c658?utm_source=chatgpt.com)

        do {
            try visionSequenceHandler.perform([request], on: buffer)
        } catch {
            print("Vision error:", error)
        }
    }

    private func drawDetections(on request: VNRequest) {
        detectionOverlay.sublayers?.forEach { $0.removeFromSuperlayer() }
        guard let results = request.results as? [VNDetectedObjectObservation] else { return }

        // Only keep observations with confidence ≥ 0.6
        let filtered = results.filter { $0.confidence >= 0.6 }  // VNDetectedObjectObservation.confidence  [oai_citation:2‡developer.apple.com](https://developer.apple.com/documentation/vision/detectedobjectobservation/description?utm_source=chatgpt.com)

        for human in filtered {
            let bb = human.boundingBox
            let rect = VNImageRectForNormalizedRect(bb,
                                                    Int(detectionOverlay.bounds.width),
                                                    Int(detectionOverlay.bounds.height))
            let boxLayer = CALayer()
            boxLayer.frame = rect
            boxLayer.borderWidth = 2
            boxLayer.borderColor = UIColor.systemGreen.cgColor
            detectionOverlay.addSublayer(boxLayer)
        }
    }
}

extension ViewController: AVCaptureVideoDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput,
                       didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection)
    {
        guard let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        process(buffer: buffer)
    }
}
