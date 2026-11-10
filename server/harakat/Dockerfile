# Harakat check server for Google Cloud Run. The model is baked into the image (pinned revision, checked
# by its SHA-256) so a cold start never downloads it.
FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir onnxruntime==1.29.0 numpy==2.5.3
RUN python -c "import hashlib, urllib.request; \
u = 'https://huggingface.co/mostafanewir70/quran-recitation-ctc-onnx/resolve/f90650aac5d9dcff15230a19998c0027f45b33f1/onnx/model_q4.onnx'; \
urllib.request.urlretrieve(u, '/app/model.onnx'); \
h = hashlib.sha256(open('/app/model.onnx', 'rb').read()).hexdigest(); \
assert h == '9b17e04fdc2aef54720e62216a7c7ae7f55d27911ee7cd55253baa231845a587', h"
COPY vocab.json harakat.py follow.py server.py /app/
ENV PORT=8080 PYTHONUNBUFFERED=1
CMD ["python", "server.py"]
