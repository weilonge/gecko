/*
 * Copyright (c) 2016, Alliance for Open Media. All rights reserved
 *
 * This source code is subject to the terms of the BSD 2 Clause License and
 * the Alliance for Open Media Patent License 1.0. If the BSD 2 Clause License
 * was not distributed with this source code in the LICENSE file, you can
 * obtain it at www.aomedia.org/license/software. If the Alliance for Open
 * Media Patent License 1.0 was not distributed with this source code in the
 * PATENTS file, you can obtain it at www.aomedia.org/license/patent.
 */

#include <vector>
#include "third_party/googletest/src/googletest/include/gtest/gtest.h"
#include "test/acm_random.h"

#include "./aom_config.h"

#include "aom_ports/mem.h"  // ROUND_POWER_OF_TWO
#include "aom/aomcx.h"
#include "aom/aomdx.h"
#include "aom/aom_encoder.h"
#include "aom/aom_decoder.h"

using libaom_test::ACMRandom;
namespace {

class CompressedSource {
 public:
  explicit CompressedSource(int seed) : rnd_(seed), frame_count_(0) {
    aom_codec_iface_t *algo = &aom_codec_av1_cx_algo;

    aom_codec_enc_cfg_t cfg;
    aom_codec_enc_config_default(algo, &cfg, 0);

    const int max_q = cfg.rc_max_quantizer;

    cfg.rc_end_usage = AOM_CQ;
    cfg.rc_max_quantizer = max_q;
    cfg.rc_min_quantizer = max_q;

    // choose the picture size
    {
      width_ = rnd_.PseudoUniform(kWidth - 8) + 8;
      height_ = rnd_.PseudoUniform(kHeight - 8) + 8;
    }

    cfg.g_w = width_;
    cfg.g_h = height_;
    cfg.g_lag_in_frames = 0;

    aom_codec_enc_init(&enc_, algo, &cfg, 0);
  }

  ~CompressedSource() { aom_codec_destroy(&enc_); }

  const aom_codec_cx_pkt_t *ReadFrame() {
    uint8_t buf[kWidth * kHeight * 3 / 2] = { 0 };

    // render regular pattern
    const int period = rnd_.Rand8() % 32 + 1;
    const int phase = rnd_.Rand8() % period;

    const int val_a = rnd_.Rand8();
    const int val_b = rnd_.Rand8();

    for (int i = 0; i < (int)sizeof buf; ++i)
      buf[i] = (i + phase) % period < period / 2 ? val_a : val_b;

    aom_image_t img;
    aom_img_wrap(&img, AOM_IMG_FMT_I420, width_, height_, 0, buf);
    aom_codec_encode(&enc_, &img, frame_count_++, 1, 0, 0);

    aom_codec_iter_t iter = NULL;

    const aom_codec_cx_pkt_t *pkt = NULL;

    do {
      pkt = aom_codec_get_cx_data(&enc_, &iter);
    } while (pkt && pkt->kind != AOM_CODEC_CX_FRAME_PKT);

    return pkt;
  }

 private:
  static const int kWidth = 128;
  static const int kHeight = 128;

  ACMRandom rnd_;
  aom_codec_ctx_t enc_;
  int frame_count_;
  int width_, height_;
};

// lowers an aom_image_t to a easily comparable/printable form
std::vector<int16_t> Serialize(const aom_image_t *img) {
  std::vector<int16_t> bytes;
  bytes.reserve(img->d_w * img->d_h * 3);
  for (int plane = 0; plane < 3; ++plane) {
    const int w = aom_img_plane_width(img, plane);
    const int h = aom_img_plane_height(img, plane);

    for (int r = 0; r < h; ++r) {
      for (int c = 0; c < w; ++c) {
        unsigned char *row = img->planes[plane] + r * img->stride[plane];
        if (img->fmt & AOM_IMG_FMT_HIGHBITDEPTH)
          bytes.push_back(row[c * 2]);
        else
          bytes.push_back(row[c]);
      }
    }
  }

  return bytes;
}

class Decoder {
 public:
  explicit Decoder(int allowLowbitdepth) {
    aom_codec_iface_t *algo = &aom_codec_av1_dx_algo;

    aom_codec_dec_cfg_t cfg = aom_codec_dec_cfg_t();
    cfg.allow_lowbitdepth = allowLowbitdepth;

    aom_codec_dec_init(&dec_, algo, &cfg, 0);
  }

  ~Decoder() { aom_codec_destroy(&dec_); }

  std::vector<int16_t> decode(const aom_codec_cx_pkt_t *pkt) {
    aom_codec_decode(&dec_, static_cast<uint8_t *>(pkt->data.frame.buf),
                     static_cast<unsigned int>(pkt->data.frame.sz), NULL, 0);

    aom_codec_iter_t iter = NULL;
    return Serialize(aom_codec_get_frame(&dec_, &iter));
  }

 private:
  aom_codec_ctx_t dec_;
};

// Try to reveal a mismatch between LBD and HBD coding paths.
TEST(CodingPathSync, SearchForHbdLbdMismatch) {
  const int count_tests = 100;
  for (int i = 0; i < count_tests; ++i) {
    Decoder dec_hbd(0);
    Decoder dec_lbd(1);

    CompressedSource enc(i);
    const aom_codec_cx_pkt_t *frame = enc.ReadFrame();

    std::vector<int16_t> lbd_yuv = dec_lbd.decode(frame);
    std::vector<int16_t> hbd_yuv = dec_hbd.decode(frame);

    ASSERT_EQ(lbd_yuv, hbd_yuv);
  }
}

}  // namespace
