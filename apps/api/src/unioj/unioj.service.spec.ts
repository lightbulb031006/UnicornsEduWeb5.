/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { UniojService } from './unioj.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Readable } from 'stream';

describe('UniojService', () => {
  let service: UniojService;
  let httpService: any;
  let uniojBaseUrl = 'https://oj.test.local';

  beforeEach(async () => {
    uniojBaseUrl = 'https://oj.test.local';
    httpService = {
      axiosRef: {
        get: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UniojService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key, val) => {
              if (key === 'UNIOJ_API_KEY') return 'test-key';
              if (key === 'UNIOJ_BASE_URL') return uniojBaseUrl;
              return val;
            }),
          },
        },
        {
          provide: HttpService,
          useValue: httpService,
        },
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<UniojService>(UniojService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getStudentReport', () => {
    it('should include a direct PDF URL built from UNIOJ_BASE_URL', async () => {
      const studentName = 'Học viên Test';
      const username = 'testuser';

      httpService.axiosRef.get.mockResolvedValueOnce({
        data: {
          data: {
            username,
          },
        },
      });
      httpService.axiosRef.get.mockResolvedValueOnce({
        data: {
          data: {
            student: {
              id: 1,
              username,
              display_name: 'Học viên Test Display',
            },
            summary: {
              problem_count: 50,
              ac_rate: 80,
              total_submissions: 100,
            },
            roadmap_levels: [],
          },
        },
      });

      const result = await service.getStudentReport(studentName, 90);

      expect(result.student).toEqual({
        username,
        displayName: 'Học viên Test Display',
        pdfUrl: `${uniojBaseUrl}/api/student-report/${username}/pdf/?days=90`,
      });
    });
  });

  describe('getStudentReportPdf', () => {
    const studentName = 'Học viên Test';
    const username = 'testuser';
    const mockLookupResponse = {
      data: {
        data: {
          username,
        },
      },
    };

    it('should proxy PDF successfully when UNIOJ returns application/pdf', async () => {
      const mockPdfStream = { pipe: jest.fn() };
      const mockPdfResponse = {
        data: mockPdfStream,
        headers: {
          'content-type': 'application/pdf',
        },
      };

      httpService.axiosRef.get.mockResolvedValueOnce(mockLookupResponse);
      httpService.axiosRef.get.mockResolvedValueOnce(mockPdfResponse);

      const result = await service.getStudentReportPdf(studentName, 90);

      expect(httpService.axiosRef.get).toHaveBeenNthCalledWith(
        1,
        `${uniojBaseUrl}/api/student-lookup/`,
        expect.objectContaining({
          params: { name: studentName },
        }),
      );

      expect(httpService.axiosRef.get).toHaveBeenNthCalledWith(
        2,
        `${uniojBaseUrl}/api/student-report/${username}/pdf/`,
        expect.objectContaining({
          params: { days: 90 },
          responseType: 'stream',
        }),
      );

      expect(result.headers['content-type']).toBe('application/pdf');
      expect(result.headers['content-disposition']).toBe(
        `inline; filename="report-${username}.pdf"`,
      );
      expect(result.data).toBe(mockPdfStream);
    });

    it('should throw without falling back to JSON rendering when PDF fetch fails', async () => {
      httpService.axiosRef.get.mockResolvedValueOnce(mockLookupResponse);
      httpService.axiosRef.get.mockRejectedValueOnce({
        response: {
          status: 503,
          data: { detail: 'PDF unavailable' },
        },
        message: 'Request failed with status code 503',
      });

      await expect(
        service.getStudentReportPdf(studentName, 90),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(httpService.axiosRef.get).toHaveBeenCalledTimes(2);
    });

    it('should handle circular stream error data without crashing', async () => {
      const circularData: Record<string, unknown> = {};
      circularData.self = circularData;

      httpService.axiosRef.get.mockResolvedValueOnce(mockLookupResponse);
      httpService.axiosRef.get.mockRejectedValueOnce({
        response: {
          status: 500,
          data: circularData,
        },
        message: 'Request failed with status code 500',
      });

      await expect(
        service.getStudentReportPdf(studentName, 90),
      ).rejects.toThrow(BadGatewayException);

      expect(httpService.axiosRef.get).toHaveBeenCalledTimes(2);
    });

    it('should read streamed upstream error bodies from PDF responses', async () => {
      httpService.axiosRef.get.mockResolvedValueOnce(mockLookupResponse);
      httpService.axiosRef.get.mockResolvedValueOnce({
        status: 503,
        data: Readable.from([
          JSON.stringify({
            api_version: '1.0',
            error: {
              code: 503,
              message: 'pdf rendering is not available on this site',
            },
          }),
        ]),
        headers: {
          'content-type': 'application/json',
        },
      });

      await expect(
        service.getStudentReportPdf(studentName, 90),
      ).rejects.toThrow('pdf rendering is not available on this site');

      expect(httpService.axiosRef.get).toHaveBeenCalledTimes(2);
    });

    it('should reject non-PDF responses from the PDF endpoint', async () => {
      httpService.axiosRef.get.mockResolvedValueOnce(mockLookupResponse);
      httpService.axiosRef.get.mockResolvedValueOnce({
        data: { detail: 'not a pdf' },
        headers: {
          'content-type': 'application/json',
        },
      });

      await expect(
        service.getStudentReportPdf(studentName, 90),
      ).rejects.toThrow(BadGatewayException);

      expect(httpService.axiosRef.get).toHaveBeenCalledTimes(2);
    });

    it('should fall back to oj.uniedu.vn when UNIOJ_BASE_URL points at local API', async () => {
      uniojBaseUrl = 'http://localhost:4000';
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UniojService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockImplementation((key, val) => {
                if (key === 'UNIOJ_API_KEY') return 'test-key';
                if (key === 'UNIOJ_BASE_URL') return uniojBaseUrl;
                return val;
              }),
            },
          },
          {
            provide: HttpService,
            useValue: httpService,
          },
          {
            provide: PrismaService,
            useValue: {},
          },
        ],
      }).compile();
      const serviceWithLocalBaseUrl = module.get<UniojService>(UniojService);

      httpService.axiosRef.get.mockResolvedValueOnce(mockLookupResponse);
      httpService.axiosRef.get.mockResolvedValueOnce({
        data: { pipe: jest.fn() },
        headers: {
          'content-type': 'application/pdf',
        },
      });

      await serviceWithLocalBaseUrl.getStudentReportPdf(studentName, 90);

      expect(httpService.axiosRef.get).toHaveBeenNthCalledWith(
        1,
        'https://oj.uniedu.vn/api/student-lookup/',
        expect.anything(),
      );
      expect(httpService.axiosRef.get).toHaveBeenNthCalledWith(
        2,
        `https://oj.uniedu.vn/api/student-report/${username}/pdf/`,
        expect.anything(),
      );
    });
  });
});
